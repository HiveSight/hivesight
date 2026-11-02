import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  applyRules,
  buildRoutes,
  drift,
  normalize,
  plan,
  PREFIX,
  routeProblems,
  ruleMatches,
  RULES,
  samplePath,
  vercelClient,
} from "../../../scripts/firewall.mjs";

type Rule = (typeof RULES)[number] & { id?: string };
type Change = { action: string; id: string | null; value: unknown };

/** Applies draft changes the way Vercel's API does, giving inserted rules new ids. */
function stageAll(rules: Rule[], changes: Change[], nextId = { n: 0 }): Rule[] {
  let out = [...rules];
  for (const change of changes) {
    if (change.action === "rules.insert") {
      out.push({ ...(change.value as Rule), id: `new_${nextId.n++}` });
    } else if (change.action === "rules.update") {
      out = out.map((r) => (r.id === change.id ? { ...(change.value as Rule), id: r.id } : r));
    } else if (change.action === "rules.remove") {
      out = out.filter((r) => r.id !== change.id);
    } else {
      throw new Error(`unexpected change ${change.action}`);
    }
  }
  return out;
}

const managedOf = (rules: Rule[]) => rules.filter((r) => r.name.startsWith(PREFIX));
/** What a rule does, read from its fields here rather than through normalize. */
const meaning = (r: Rule) => {
  const { rateLimit } = r.action.mitigate;
  return JSON.stringify([
    r.name,
    r.active,
    r.conditionGroup.map((g) => g.conditions.map((c) => [c.type, c.op, c.value])),
    r.action.mitigate.action,
    [rateLimit.algo, Number(rateLimit.window), Number(rateLimit.limit), rateLimit.keys, rateLimit.action],
  ]);
};
const canonical = (rules: Rule[]) => rules.map(meaning).sort();

/** One rule as Vercel might hold it: a desired rule, an edited one, or another name. */
const ruleArb: fc.Arbitrary<Rule> = fc.oneof(
  fc.constantFrom(...RULES),
  fc.record({
    base: fc.constantFrom(...RULES),
    limit: fc.integer({ min: 1, max: 1000 }),
    window: fc.integer({ min: 10, max: 600 }),
    active: fc.boolean(),
  }).map(({ base, limit, window, active }) => ({
    ...base,
    active,
    action: {
      mitigate: {
        ...base.action.mitigate,
        rateLimit: { ...base.action.mitigate.rateLimit, limit, window },
      },
    },
  })),
  fc.constantFrom("estimates old", "health v2").map((name) => ({ ...RULES[0], name: PREFIX + name })),
  fc.constantFrom("Block bots", "hivesight estimates", "HIVESIGHT: estimates").map((name) => ({
    ...RULES[1],
    name,
  }))
);

const currentArb = fc
  .array(ruleArb, { maxLength: 12 })
  .map((rules) => rules.map((r, i) => ({ ...r, id: `rule_${i}` })));

describe("RULES", () => {
  it("stays inside what Vercel's Pro plan allows", () => {
    expect(RULES.length).toBeLessThanOrEqual(40);
    expect(new Set(RULES.map((r) => r.name)).size).toBe(RULES.length);
    for (const rule of RULES) {
      const { rateLimit } = rule.action.mitigate;
      expect(rule.name.startsWith(PREFIX)).toBe(true);
      expect(rule.name.length).toBeLessThanOrEqual(160);
      expect(rule.description.length).toBeLessThanOrEqual(256);
      expect(rule.action.mitigate.action).toBe("rate_limit");
      expect(rateLimit.algo).toBe("fixed_window");
      expect(rateLimit.window).toBeGreaterThanOrEqual(10);
      expect(rateLimit.window).toBeLessThanOrEqual(600);
      expect(rateLimit.keys).toEqual(["ip"]);
      expect(rateLimit.action).toBe("rate_limit");
      expect(Number.isInteger(rateLimit.limit) && rateLimit.limit >= 1).toBe(true);
    }
  });

  it("states each rule's limit in its description", () => {
    const words: Record<number, string> = { 5: "Five", 10: "Ten", 20: "Twenty", 120: "120" };
    for (const rule of RULES) {
      expect(rule.description.startsWith(words[rule.action.mitigate.rateLimit.limit])).toBe(true);
    }
  });
});

describe("plan", () => {
  it("creates every rule on an empty firewall", () => {
    const changes = plan([]);
    expect(changes.map((c: Change) => c.action)).toEqual(RULES.map(() => "rules.insert"));
    expect(canonical(stageAll([], changes))).toEqual(canonical(RULES));
  });

  it("brings the managed rules to RULES and leaves every other rule as it was", () => {
    fc.assert(
      fc.property(currentArb, (current) => {
        const changes: Change[] = plan(current);
        const after = stageAll(current, changes);
        expect(canonical(managedOf(after))).toEqual(canonical(RULES));
        const others = (rules: Rule[]) => rules.filter((r) => !r.name.startsWith(PREFIX));
        expect(others(after)).toEqual(others(current));
        const unmanagedIds = new Set(others(current).map((r) => r.id));
        expect(changes.every((c) => c.id === null || !unmanagedIds.has(c.id))).toBe(true);
      })
    );
  });

  it("asks for nothing once the rules match", () => {
    fc.assert(
      fc.property(currentArb, (current) => {
        const after = stageAll(current, plan(current));
        expect(plan(after)).toEqual([]);
        expect(drift(after)).toEqual([]);
      })
    );
  });

  it("reports drift exactly when the plan has work to do", () => {
    fc.assert(
      fc.property(currentArb, (current) => {
        expect(drift(current).length > 0).toBe(plan(current).length > 0);
      })
    );
  });
});

describe("drift", () => {
  it("names each kind of difference", () => {
    const extra = { ...RULES[0], id: "x", name: `${PREFIX}estimates old` };
    const slower = {
      ...RULES[2],
      action: {
        mitigate: {
          ...RULES[2].action.mitigate,
          rateLimit: { ...RULES[2].action.mitigate.rateLimit, limit: 21 },
        },
      },
    };
    const off = { ...RULES[3], active: false };
    expect(drift([...RULES, extra])).toEqual([`unexpected: ${PREFIX}estimates old`]);
    expect(drift([RULES[0], RULES[1], slower, off])).toEqual([
      `differs: ${PREFIX}health`,
      `differs: ${PREFIX}keepalive`,
      `disabled: ${PREFIX}keepalive`,
    ]);
    expect(drift([RULES[0], RULES[0], RULES[1], RULES[2]])).toEqual([
      `repeated 2 times: ${PREFIX}estimates`,
      `missing: ${PREFIX}keepalive`,
    ]);
  });
});

describe("normalize", () => {
  it("treats Vercel's read-back forms as the same rule", () => {
    const rule = RULES[0];
    const readBack = {
      ...rule,
      id: "rule_1",
      valid: true,
      validationErrors: null,
      conditionGroup: [{ conditions: [{ ...rule.conditionGroup[0].conditions[0], neg: false }] }],
      action: {
        mitigate: {
          action: "rate_limit",
          rateLimit: { algo: "fixed_window", window: "60", limit: "10", keys: ["ip"] },
          bypassSystem: false,
        },
      },
    };
    expect(normalize(readBack)).toEqual(normalize(rule));
  });

  it("tells apart rules that differ in what they do", () => {
    const rule = RULES[0];
    const { rateLimit } = rule.action.mitigate;
    const variants = [
      { ...rule, active: false },
      { ...rule, description: "other" },
      { ...rule, conditionGroup: [{ conditions: [{ type: "path", op: "pre", value: "/api/run" }] }] },
      ...[{ limit: 11 }, { window: 30 }, { keys: ["ja4"] }, { algo: "token_bucket" }, { action: "deny" }].map(
        (change) => ({
          ...rule,
          action: { mitigate: { ...rule.action.mitigate, rateLimit: { ...rateLimit, ...change } } },
        })
      ),
    ];
    for (const variant of variants) expect(normalize(variant)).not.toEqual(normalize(rule));
  });
});

describe("ruleMatches", () => {
  const rule = (op: string, value: string, neg = false) => ({
    ...RULES[0],
    conditionGroup: [{ conditions: [{ type: "path", op, value, neg }] }],
  });

  it("matches paths the way Vercel's operators read them", () => {
    expect(ruleMatches(rule("eq", "/api/run"), "/api/run")).toBe(true);
    expect(ruleMatches(rule("eq", "/api/run"), "/API/Run")).toBe(true);
    expect(ruleMatches(rule("eq", "/api/run"), "/api/run/x")).toBe(false);
    expect(ruleMatches(rule("pre", "/runs/"), "/runs/abc")).toBe(true);
    expect(ruleMatches(rule("pre", "/runs/"), "/runs")).toBe(false);
    expect(ruleMatches(rule("eq", "/api/run", true), "/api/health")).toBe(true);
    expect(ruleMatches(rule("re", "^/api/(run|health)$"), "/api/health")).toBe(true);
  });

  it("refuses conditions it can't evaluate", () => {
    const byMethod = {
      ...RULES[0],
      conditionGroup: [{ conditions: [{ type: "method", op: "eq", value: "POST" }] }],
    };
    expect(() => ruleMatches(byMethod, "/api/run")).toThrow("method");
  });
});

describe("routes", () => {
  it("fills in dynamic segments", () => {
    expect(samplePath("/runs/[id]")).toBe("/runs/sample");
    expect(samplePath("/docs/[...slug]")).toBe("/docs/a/b");
    expect(samplePath("/docs/[[...slug]]")).toBe("/docs/a/b");
  });

  it("splits a build into files and function routes", () => {
    // A minimal stand-in for Next's two manifests, not a real build.
    const dir = mkdtempSync(path.join(tmpdir(), "firewall-"));
    writeFileSync(
      path.join(dir, "app-path-routes-manifest.json"),
      JSON.stringify({ "/page": "/", "/api/run/route": "/api/run", "/runs/[id]/page": "/runs/[id]" })
    );
    writeFileSync(path.join(dir, "prerender-manifest.json"), JSON.stringify({ routes: { "/": {} } }));
    expect(buildRoutes(dir)).toEqual({ functions: ["/api/run", "/runs/[id]"], files: ["/"] });
  });

  it("covers each function route once and no file route", () => {
    const functions = ["/api/cron/keepalive", "/api/health", "/api/run", "/runs/[id]"];
    const files = ["/", "/_not-found", "/benchmarks", "/methodology"];
    expect(routeProblems({ functions, files })).toEqual([]);
  });

  it("names a route no rule covers, a file a rule covers and a rule with no route", () => {
    const problems = routeProblems({
      functions: ["/api/run", "/api/export"],
      files: ["/runs/about"],
    });
    expect(problems).toContain("/api/export runs a function and 0 rules cover it");
    expect(problems).toContain(`/runs/about is a file and ${PREFIX}shared estimates covers it`);
    expect(problems).toContain(`${PREFIX}health covers no function route`);
  });

  it("names a function route that two rules cover", () => {
    const overlapping = [...RULES, { ...RULES[1], name: `${PREFIX}runs again` }];
    expect(routeProblems({ functions: ["/runs/[id]"], files: [] }, overlapping)).toContain(
      "/runs/[id] runs a function and 2 rules cover it"
    );
  });
});

/** An in-memory stand-in for Vercel's firewall API, holding one active config and one draft. */
function fakeVercel(active: { firewallEnabled: boolean; rules: Rule[] } | null, opts: {
  draftChanges?: Change[];
  failPublish?: boolean;
  dropOnPublish?: string;
  editOnPublish?: string;
} = {}) {
  const state = {
    active,
    draft: null as null | { firewallEnabled: boolean; rules: Rule[]; changes: Change[] },
    calls: [] as string[],
  };
  if (opts.draftChanges) {
    state.draft = {
      firewallEnabled: active?.firewallEnabled ?? false,
      rules: active?.rules ?? [],
      changes: opts.draftChanges,
    };
  }
  const ids = { n: 0 };
  const client = {
    async configs() {
      state.calls.push("configs");
      return structuredClone({ active: state.active, draft: state.draft, versions: [] });
    },
    async stage(change: Change) {
      state.calls.push(`stage ${change.action}`);
      const base = state.draft ?? {
        firewallEnabled: state.active?.firewallEnabled ?? false,
        rules: state.active?.rules ?? [],
        changes: [],
      };
      state.draft = {
        firewallEnabled: change.action === "firewallEnabled" ? (change.value as boolean) : base.firewallEnabled,
        rules: change.action === "firewallEnabled" ? base.rules : stageAll(base.rules, [change], ids),
        changes: [...base.changes, change],
      };
    },
    async publish() {
      state.calls.push("publish");
      if (opts.failPublish) throw new Error("HTTP 500");
      const { firewallEnabled, rules } = state.draft!;
      state.active = {
        firewallEnabled,
        rules: rules
          .filter((r) => r.name !== opts.dropOnPublish)
          .map((r) => (r.name === opts.editOnPublish ? { ...r, active: !r.active } : r)),
      };
      state.draft = null;
    },
    async discard() {
      state.calls.push("discard");
      state.draft = null;
    },
  };
  return { client, state };
}

const quiet = () => {};
const dashboardRule: Rule = { ...RULES[1], id: "dash_1", name: "Block bots" };

describe("applyRules", () => {
  it("enables the firewall and publishes every rule on a project with no config", async () => {
    const { client, state } = fakeVercel(null);
    const changes = await applyRules({ client, log: quiet });
    expect(changes[0]).toEqual({ action: "firewallEnabled", id: null, value: true });
    expect(state.active?.firewallEnabled).toBe(true);
    expect(canonical(state.active!.rules)).toEqual(canonical(RULES));
    expect(state.draft).toBeNull();
  });

  it("checks a draft and discards it without publishing on a dry run", async () => {
    const { client, state } = fakeVercel({ firewallEnabled: true, rules: [dashboardRule] });
    const changes = await applyRules({ client, log: quiet, publish: false });
    expect(changes).toHaveLength(RULES.length);
    expect(state.calls).not.toContain("publish");
    expect(state.calls.at(-1)).toBe("discard");
    expect(state.active).toEqual({ firewallEnabled: true, rules: [dashboardRule] });
    expect(state.draft).toBeNull();
  });

  it("changes nothing when the live rules match", async () => {
    const { client, state } = fakeVercel(null);
    await applyRules({ client, log: quiet });
    state.calls = [];
    expect(await applyRules({ client, log: quiet })).toEqual([]);
    expect(state.calls).toEqual(["configs"]);
  });

  it("keeps a rule someone added in the dashboard", async () => {
    const { client, state } = fakeVercel({ firewallEnabled: true, rules: [dashboardRule] });
    await applyRules({ client, log: quiet });
    expect(state.active!.rules[0]).toEqual(dashboardRule);
    expect(canonical(managedOf(state.active!.rules))).toEqual(canonical(RULES));
  });

  it("refuses to publish someone else's unpublished draft", async () => {
    const pending = [{ action: "rules.remove", id: "dash_1", value: null }];
    const { client, state } = fakeVercel(
      { firewallEnabled: true, rules: [dashboardRule] },
      { draftChanges: pending }
    );
    await expect(applyRules({ client, log: quiet })).rejects.toThrow("unpublished changes");
    expect(state.calls).toEqual(["configs"]);
    expect(state.draft?.changes).toEqual(pending);
  });

  it("discards its draft when publishing fails", async () => {
    const { client, state } = fakeVercel(null, { failPublish: true });
    await expect(applyRules({ client, log: quiet })).rejects.toThrow("HTTP 500");
    expect(state.calls.at(-1)).toBe("discard");
    expect(state.draft).toBeNull();
    expect(state.active).toBeNull();
  });

  it("fails when the published config doesn't hold every rule", async () => {
    const { client } = fakeVercel(null, { dropOnPublish: `${PREFIX}health` });
    await expect(applyRules({ client, log: quiet })).rejects.toThrow(`missing: ${PREFIX}health`);
  });

  it("fails when a rule outside its names changed on the way to production", async () => {
    const { client } = fakeVercel(
      { firewallEnabled: true, rules: [dashboardRule] },
      { editOnPublish: "Block bots" }
    );
    await expect(applyRules({ client, log: quiet })).rejects.toThrow("other rules changed");
  });
});

describe("vercelClient", () => {
  it("sends the CLI's requests and reports a refusal with its status", async () => {
    const sent: Array<{ url: string; method: string; body?: string; auth: string | null }> = [];
    const fetchFn = async (url: string, init: RequestInit) => {
      sent.push({
        url,
        method: init.method!,
        body: init.body as string | undefined,
        auth: new Headers(init.headers).get("authorization"),
      });
      return new Response(init.method === "DELETE" ? "denied" : "{}", {
        status: init.method === "DELETE" ? 403 : 200,
      });
    };
    const client = vercelClient({ token: "t0ken", fetchFn: fetchFn as typeof fetch });
    await client.configs();
    await client.stage({ action: "rules.remove", id: "r1", value: null });
    await client.publish();
    await expect(client.discard()).rejects.toThrow("HTTP 403 denied");
    const query = "?projectId=prj_TWAQsAF7qNZpWMLx6Lhvd7YwyZgu&teamId=team_o3QtvpZGRAXmvhbyKiMh7ZGv";
    expect(sent.map((s) => `${s.method} ${s.url}`)).toEqual([
      `GET https://api.vercel.com/v1/security/firewall/config${query}`,
      `PATCH https://api.vercel.com/v1/security/firewall/config/draft${query}`,
      `POST https://api.vercel.com/v1/security/firewall/config/draft/activate${query}`,
      `DELETE https://api.vercel.com/v1/security/firewall/config/draft${query}`,
    ]);
    expect(sent[1].body).toBe(JSON.stringify({ action: "rules.remove", id: "r1", value: null }));
    expect(sent.every((s) => s.auth === "Bearer t0ken")).toBe(true);
  });
});
