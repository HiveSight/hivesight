import { readFileSync } from "node:fs";
import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  apply,
  BOT,
  CONDITIONS,
  decide,
  githubClient,
  LABEL,
  outageProblems,
  parseState,
  probe,
  QUIET_MS,
  renderBody,
  sizeProblems,
} from "../../../scripts/health-monitor.mjs";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const MINUTE = 60_000;

const healthy = (overrides: object = {}) => ({
  status: 200,
  body: {
    status: "ok",
    checkedAt: new Date(NOW).toISOString(),
    checks: [
      { name: "model_config", status: "ok", message: "OPENAI_API_KEY configured" },
      { name: "cell_data", status: "ok", message: "139 cells" },
      { name: "store", status: "ok", message: "ok" },
      { name: "database_size", status: "ok", message: "12 MB of 500 MB" },
    ],
    ...overrides,
  },
});

const withStore = (store: object) =>
  healthy({ checks: [{ name: "store", ...store }] });

describe("outageProblems", () => {
  it("passes a healthy answer", () => {
    expect(outageProblems(healthy(), NOW)).toEqual([]);
  });

  it.each([
    ["a failed store", { status: 503, body: { ...healthy().body, status: "degraded", checks: [{ name: "store", status: "failed", message: "store unreachable" }] } }, "store: store unreachable"],
    ["a failed check beside the store", { status: 503, body: { ...healthy().body, status: "degraded", checks: [{ name: "store", status: "ok" }, { name: "cell_data", status: "failed", message: "cell data failed to load" }] } }, "cell_data: cell data failed to load"],
    ["no store check", healthy({ checks: [] }), "health endpoint reported no store check"],
    ["a disabled store", withStore({ status: "disabled" }), "store: disabled"],
    ["an answer with no checks", { status: 200, body: { status: "ok" } }, "health endpoint answered HTTP 200 with no checks"],
    ["a page that isn't JSON", { status: 502, body: null }, "health endpoint answered HTTP 502 with no checks"],
    ["an error status with passing checks", { ...healthy(), status: 500 }, "health endpoint answered HTTP 500, status ok"],
    ["a degraded status with passing checks", healthy({ status: "degraded" }), "health endpoint answered HTTP 200, status degraded"],
    ["a network failure", { error: "fetch failed" }, "health endpoint unreachable: fetch failed"],
  ])("reports %s", (_name, answer, expected) => {
    expect(outageProblems(answer, NOW)).toEqual([expected]);
  });

  it("rejects an old answer a cache could have kept", () => {
    const old = new Date(NOW - 10 * MINUTE).toISOString();
    expect(outageProblems(healthy({ checkedAt: old }), NOW)).toEqual([`health answer is stale: ${old}`]);
    const fresh = new Date(NOW - 10 * MINUTE + 1).toISOString();
    expect(outageProblems(healthy({ checkedAt: fresh }), NOW)).toEqual([]);
  });

  it("rejects an answer with no usable time", () => {
    expect(outageProblems(healthy({ checkedAt: undefined }), NOW)).toHaveLength(1);
    expect(outageProblems(healthy({ checkedAt: "soon" }), NOW)).toHaveLength(1);
  });

  it("fails safe on any body at all", () => {
    fc.assert(
      fc.property(fc.anything(), fc.integer({ min: 100, max: 599 }), (body, status) => {
        expect(outageProblems({ status, body }, NOW).length).toBeGreaterThan(0);
      })
    );
  });

  it("passes only an answer with every part of a clear pass", () => {
    const answer = fc.record({
      status: fc.constantFrom(200, 503),
      overall: fc.constantFrom("ok", "degraded"),
      store: fc.constantFrom("ok", "failed", "disabled", null),
      other: fc.constantFrom("ok", "failed"),
      minutesOld: fc.integer({ min: 0, max: 20 }),
    });
    fc.assert(
      fc.property(answer, ({ status, overall, store, other, minutesOld }) => {
        const checks: Array<{ name: string; status: string; message: string }> = [
          { name: "cell_data", status: other, message: "m" },
        ];
        if (store) checks.push({ name: "store", status: store, message: "m" });
        const body = {
          status: overall,
          checkedAt: new Date(NOW - minutesOld * MINUTE).toISOString(),
          checks,
        };
        const clearPass =
          status === 200 && overall === "ok" && store === "ok" && other === "ok" && minutesOld < 10;
        expect(outageProblems({ status, body }, NOW).length === 0).toBe(clearPass);
      })
    );
  });

  it("reads the drill file as the failure a real outage produces", () => {
    const body = JSON.parse(readFileSync(path.resolve("scripts/health-drill.json"), "utf8"));
    expect(outageProblems({ status: 200, body }, NOW)).toEqual(["store: store unreachable"]);
  });
});

describe("sizeProblems", () => {
  const sized = (status: string) =>
    healthy({ checks: [{ name: "database_size", status, message: "450 MB of 500 MB" }] });

  it("warns on a warning and clears on a good reading", () => {
    expect(sizeProblems(sized("warning"))).toEqual(["database_size: 450 MB of 500 MB"]);
    expect(sizeProblems(sized("ok"))).toEqual([]);
  });

  it("learns nothing from an answer with no reading", () => {
    expect(sizeProblems(sized("unknown"))).toBeNull();
    expect(sizeProblems(healthy({ checks: [] }))).toBeNull();
    expect(sizeProblems({ error: "fetch failed" })).toBeNull();
    expect(sizeProblems({ status: 502, body: null })).toBeNull();
  });
});

describe("decide", () => {
  const open = { lastFailedAt: new Date(NOW - QUIET_MS).toISOString() };

  it("opens once and then only updates", () => {
    expect(decide({ open: undefined, problems: ["p"], now: NOW })).toBe("open");
    expect(decide({ open, problems: ["p"], now: NOW })).toBe("update");
  });

  it("closes only after the quiet window", () => {
    expect(decide({ open, problems: [], now: NOW })).toBe("close");
    expect(decide({ open, problems: [], now: NOW - 1 })).toBe("none");
    expect(decide({ open: undefined, problems: [], now: NOW })).toBe("none");
  });
});

/** An in-memory GitHub holding what the real one would, for replaying runs. */
function fakeGithub() {
  const issues = new Map<number, { body: string; open: boolean; comments: number }>();
  let next = 1;
  return {
    issues,
    created: 0,
    openIssues() {
      return [...issues.entries()]
        .filter(([, issue]) => issue.open)
        .map(([number, issue]) => ({ number, state: parseState(issue.body) }));
    },
    async create(_title: string, body: string) {
      this.created += 1;
      issues.set(next, { body, open: true, comments: 0 });
      next += 1;
    },
    async update(number: number, body: string) {
      issues.get(number)!.body = body;
    },
    async close(number: number) {
      const issue = issues.get(number)!;
      issue.open = false;
      issue.comments += 1;
    },
  };
}

describe("a sequence of runs", () => {
  // Each step: minutes since the last run, and whether this run saw a failure.
  const runs = fc.array(
    fc.record({ minutes: fc.integer({ min: 1, max: 90 }), failing: fc.boolean() }),
    { maxLength: 60 }
  );

  async function replay(steps: Array<{ minutes: number; failing: boolean }>, after: (state: {
    github: ReturnType<typeof fakeGithub>;
    now: number;
    failing: boolean;
    lastFailure: number | null;
    incidents: number;
  }) => void) {
    const github = fakeGithub();
    let now = NOW;
    let lastFailure: number | null = null;
    let incidents = 0;
    let incidentOpen = false;
    for (const { minutes, failing } of steps) {
      now += minutes * MINUTE;
      // The reference: an incident starts at a failure with none open and ends
      // at the first pass a full quiet window after its last failure.
      if (failing) {
        if (!incidentOpen) incidents += 1;
        incidentOpen = true;
        lastFailure = now;
      } else if (incidentOpen && now - lastFailure! >= QUIET_MS) {
        incidentOpen = false;
      }
      await apply({
        observed: { outage: failing ? ["store: store unreachable"] : [] },
        issues: github.openIssues(),
        github,
        now,
        runUrl: "https://example.test/run",
      });
      after({ github, now, failing, lastFailure, incidents });
    }
  }

  it("raises exactly one alert per incident", async () => {
    await fc.assert(
      fc.asyncProperty(runs, async (steps) => {
        await replay(steps, ({ github, incidents }) => {
          expect(github.created).toBe(incidents);
        });
      })
    );
  });

  it("never holds two open issues", async () => {
    await fc.assert(
      fc.asyncProperty(runs, async (steps) => {
        await replay(steps, ({ github }) => {
          expect(github.openIssues().length).toBeLessThanOrEqual(1);
        });
      })
    );
  });

  it("holds an issue open through any failing run and its quiet window", async () => {
    await fc.assert(
      fc.asyncProperty(runs, async (steps) => {
        await replay(steps, ({ github, now, lastFailure }) => {
          if (lastFailure !== null && now - lastFailure < QUIET_MS) {
            expect(github.openIssues()).toHaveLength(1);
          }
        });
      })
    );
  });

  it("raises no second alert on a run that sees the same failure", async () => {
    const github = fakeGithub();
    const observed = { outage: ["store: store unreachable"] };
    const run = (now: number) =>
      apply({ observed, issues: github.openIssues(), github, now, runUrl: "https://example.test/run" });
    expect(await run(NOW)).toEqual({ outage: "open" });
    expect(await run(NOW + 15 * MINUTE)).toEqual({ outage: "update" });
    expect(github.created).toBe(1);
    const { state } = github.openIssues()[0];
    expect(state).toMatchObject({ failedRuns: 2, startedAt: new Date(NOW).toISOString() });
    expect(state?.lastFailedAt).toBe(new Date(NOW + 15 * MINUTE).toISOString());
  });

  it("keeps a condition with no reading exactly as it was", async () => {
    const github = fakeGithub();
    const run = (observed: object, now: number) =>
      apply({ observed, issues: github.openIssues(), github, now, runUrl: "https://example.test/run" });
    await run({ "database-size": ["database_size: 450 MB of 500 MB"] }, NOW);
    await run({ "database-size": null }, NOW + 24 * 60 * MINUTE);
    expect(github.openIssues()).toHaveLength(1);
  });

  it("keeps a drill's issue apart from a real outage's", async () => {
    const github = fakeGithub();
    const run = (observed: object, now: number) =>
      apply({ observed, issues: github.openIssues(), github, now, runUrl: "https://example.test/run" });
    await run({ drill: ["store: store unreachable"] }, NOW);
    await run({ outage: ["store: store unreachable"], drill: [] }, NOW + MINUTE);
    expect(github.created).toBe(2);
    expect(github.openIssues().map((i) => i.state?.condition).sort()).toEqual(["drill", "outage"]);
  });

  it("closes every issue of a condition, should a race ever have opened two", async () => {
    const github = fakeGithub();
    const failed = { outage: ["store: store unreachable"] };
    await apply({ observed: failed, issues: [], github, now: NOW, runUrl: "u" });
    await apply({ observed: failed, issues: [], github, now: NOW, runUrl: "u" });
    await apply({
      observed: { outage: [] },
      issues: github.openIssues(),
      github,
      now: NOW + QUIET_MS,
      runUrl: "u",
    });
    expect(github.openIssues()).toEqual([]);
  });
});

describe("the issue body", () => {
  const state = {
    condition: "outage",
    startedAt: "2026-11-02T12:00:00.000Z",
    lastFailedAt: "2026-11-02T12:15:00.000Z",
    failedRuns: 2,
    problems: ["store: store unreachable"],
  };

  it("carries the state from one run to the next", () => {
    expect(parseState(renderBody(state, "https://example.test/run"))).toEqual(state);
  });

  it("carries any health message, however hostile, without a mention or markup", () => {
    fc.assert(
      fc.property(fc.string(), (message) => {
        const problems = outageProblems(
          { status: 503, body: { checks: [{ name: "store", status: "failed", message }] } },
          NOW
        );
        const body = renderBody({ ...state, problems }, "https://example.test/run");
        expect(parseState(body)).toEqual({ ...state, problems });
        expect(problems.join()).not.toMatch(/[@<>`\n\r]/);
      })
    );
    const [problem] = outageProblems(
      { status: 503, body: { checks: [{ name: "store", status: "failed", message: "@MaxGhenis <!-- x -->\nhi" }] } },
      NOW
    );
    expect(problem).toBe("store: MaxGhenis   -- x --  hi");
  });

  it("treats a body with no state as no issue of ours", () => {
    expect(parseState("written by hand")).toBeNull();
    expect(parseState(null)).toBeNull();
    expect(parseState("<!-- health-monitor {not json} -->")).toBeNull();
    expect(parseState('<!-- health-monitor {"condition":"toString"} -->')).toBeNull();
  });

  it("names every condition", () => {
    for (const condition of Object.values(CONDITIONS)) {
      expect(condition.title).not.toBe("");
      expect(condition.advice.length).toBeGreaterThan(0);
    }
  });
});

describe("probe", () => {
  const respond = (answer: { status: number; body: unknown }) =>
    new Response(JSON.stringify(answer.body), { status: answer.status });
  const live = () => {
    const answer = healthy({ checkedAt: new Date().toISOString() });
    return respond(answer);
  };
  const down = () => new Response("<html>Bad gateway</html>", { status: 502 });

  it("stops at the first pass", async () => {
    let calls = 0;
    const fetchFn = async () => ((calls += 1), calls === 1 ? down() : live());
    const answer = await probe("https://example.test", { retryMs: 0, fetchFn });
    expect(calls).toBe(2);
    expect(outageProblems(answer, Date.now())).toEqual([]);
  });

  it("gives up after three failures and returns the last", async () => {
    let calls = 0;
    const fetchFn = async () => ((calls += 1), down());
    const answer = await probe("https://example.test", { retryMs: 0, fetchFn });
    expect(calls).toBe(3);
    expect(outageProblems(answer, Date.now())).toEqual(["health endpoint answered HTTP 502 with no checks"]);
  });

  it("reports a request that fails as unreachable", async () => {
    const fetchFn = async () => {
      throw new Error("connect ETIMEDOUT");
    };
    const answer = await probe("https://example.test", { attempts: 1, fetchFn });
    expect(outageProblems(answer, Date.now())).toEqual(["health endpoint unreachable: connect ETIMEDOUT"]);
  });
});

describe("githubClient", () => {
  const body = renderBody(
    { condition: "outage", startedAt: "a", lastFailedAt: "b", failedRuns: 1, problems: [] },
    "u"
  );

  function client(issues: unknown[]) {
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchFn: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), method: init?.method, body: init?.body as string });
      return new Response(JSON.stringify(init?.method === "GET" ? issues : {}), { status: 200 });
    };
    return { calls, github: githubClient({ token: "t", repo: "HiveSight/hivesight", fetchFn }) };
  }

  it("ignores any issue this workflow didn't open", async () => {
    const { github, calls } = client([
      { number: 3, user: { login: "someone" }, body },
      { number: 2, user: { login: BOT }, body, pull_request: {} },
      { number: 4, user: { login: BOT }, body: "no state" },
      { number: 1, user: { login: BOT }, body },
    ]);
    expect((await github.openIssues()).map((i: { number: number }) => i.number)).toEqual([1]);
    expect(calls[0].url).toContain(`labels=${LABEL}`);
  });

  it("assigns the issue it opens and labels it for the relay", async () => {
    const { github, calls } = client([]);
    await github.create("title", "body");
    expect(JSON.parse(calls[0].body as string)).toEqual({
      title: "title",
      body: "body",
      labels: [LABEL],
      assignees: ["MaxGhenis"],
    });
  });

  it("stops on a GitHub error instead of reporting nothing open", async () => {
    const fetchFn = async () => new Response("{}", { status: 500 });
    const github = githubClient({ token: "t", repo: "HiveSight/hivesight", fetchFn });
    await expect(github.openIssues()).rejects.toThrow("HTTP 500");
  });
});

describe("the workflow", () => {
  const workflow = readFileSync(path.resolve(".github/workflows/health-monitor.yml"), "utf8");

  it("avoids the top of the hour and runs every 15 minutes", () => {
    expect(workflow).toContain('cron: "7,22,37,52 * * * *"');
  });

  it("lets one run finish before the next looks for an issue", () => {
    expect(workflow).toMatch(/concurrency:\n\s+group: health-monitor\n\s+cancel-in-progress: false/);
  });

  it("passes inputs through the environment, not into a shell line", () => {
    for (const line of workflow.split("\n").filter((l) => l.trim().startsWith("run:"))) {
      expect(line).not.toContain("${{");
    }
  });
});
