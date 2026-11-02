import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  applyRules,
  buildRoutes,
  bypassesAhead,
  drift,
  normalize,
  plan,
  PREFIX,
  routeProblems,
  ruleMatches,
  RULES,
  samplePaths,
  vercelClient,
} from "../../../scripts/firewall.mjs";

type Base = (typeof RULES)[number];
type Rule = Omit<Base, "action"> & {
  id?: string;
  valid?: boolean;
  validationErrors?: string[] | null;
  action: {
    mitigate: Omit<Base["action"]["mitigate"], "actionDuration" | "redirect"> & {
      actionDuration: string | null;
      redirect: unknown;
    };
  };
};
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
  const { mitigate } = r.action;
  const { rateLimit } = mitigate;
  return JSON.stringify([
    r.name,
    r.description,
    r.active,
    r.conditionGroup.map((g) =>
      g.conditions.map((c: { type: string; op: string; value?: string; neg?: boolean; key?: string }) => [
        c.type,
        c.op,
        c.value,
        c.neg === true,
        c.key ?? null,
      ])
    ),
    mitigate.action,
    [rateLimit.algo, Number(rateLimit.window), Number(rateLimit.limit), rateLimit.keys, rateLimit.action],
    mitigate.redirect ?? null,
    mitigate.actionDuration ?? null,
  ]);
};
const canonical = (rules: Rule[]) => rules.map(meaning).sort();

const conditionArb = fc.record({
  type: fc.constantFrom("path", "host", "method"),
  op: fc.constantFrom("eq", "pre", "sub"),
  value: fc.constantFrom("/api/run", "/runs/", "/x", "POST"),
  neg: fc.boolean(),
  key: fc.constantFrom(undefined, "x-forwarded-for"),
});

/** A desired rule with any of its fields edited, as someone might in the dashboard. */
const editedArb: fc.Arbitrary<Rule> = fc
  .record({
    base: fc.constantFrom(...RULES),
    limit: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
    window: fc.option(fc.integer({ min: 10, max: 600 }), { nil: undefined }),
    active: fc.option(fc.boolean(), { nil: undefined }),
    description: fc.option(fc.constant("edited"), { nil: undefined }),
    groups: fc.option(fc.array(fc.array(conditionArb, { minLength: 1, maxLength: 2 }), { minLength: 1, maxLength: 2 }), {
      nil: undefined,
    }),
    mitigateAction: fc.option(fc.constantFrom("deny", "log", "challenge"), { nil: undefined }),
    actionDuration: fc.option(fc.constant("1h"), { nil: undefined }),
  })
  .map(({ base, limit, window, active, description, groups, mitigateAction, actionDuration }) => ({
    ...base,
    active: active ?? base.active,
    description: description ?? base.description,
    conditionGroup: groups ? groups.map((conditions) => ({ conditions })) : base.conditionGroup,
    action: {
      mitigate: {
        ...base.action.mitigate,
        action: mitigateAction ?? base.action.mitigate.action,
        actionDuration: actionDuration ?? base.action.mitigate.actionDuration,
        rateLimit: {
          ...base.action.mitigate.rateLimit,
          limit: limit ?? base.action.mitigate.rateLimit.limit,
          window: window ?? base.action.mitigate.rateLimit.window,
        },
      },
    },
  }));

/** One rule as Vercel might hold it: a desired rule, an edited one, or another name. */
const ruleArb: fc.Arbitrary<Rule> = fc.oneof(
  fc.constantFrom(...RULES),
  editedArb,
  fc.constantFrom("estimates old", "health v2").map((name) => ({ ...RULES[0], name: PREFIX + name })),
  fc
    .constantFrom("Block bots", "hivesight estimates", "HIVESIGHT: estimates", `old ${PREFIX}estimates`)
    .map((name) => ({ ...RULES[1], name }))
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

  it("refuses desired rules that would never settle", () => {
    expect(() => plan([], [RULES[0], { ...RULES[0], description: "other" }])).toThrow("its own name");
    expect(() => plan([], [{ ...RULES[0], name: "estimates" }])).toThrow("its own name");
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

  it("names a rule Vercel marks invalid", () => {
    const flagged = [
      { ...RULES[0], valid: false },
      { ...RULES[1], valid: true, validationErrors: ["rate limiting rule quota exceeded"] },
      { ...RULES[2], valid: true, validationErrors: null },
      { ...RULES[3], valid: true, validationErrors: [] },
    ];
    expect(drift(flagged)).toEqual([`invalid: ${PREFIX}estimates`, `invalid: ${PREFIX}shared estimates`]);
  });

  it("treats a name with the prefix elsewhere as someone else's rule", () => {
    expect(drift([...RULES, { ...RULES[0], name: `old ${PREFIX}estimates` }])).toEqual([]);
    expect(plan([...RULES.map((r, i) => ({ ...r, id: `r${i}` })), { ...RULES[0], id: "x", name: `old ${PREFIX}x` }])).toEqual(
      []
    );
  });
});

describe("bypassesAhead", () => {
  const bypass = (name: string, active = true) => ({
    id: name,
    name,
    active,
    conditionGroup: [{ conditions: [{ type: "path", op: "pre", value: "/api/" }] }],
    action: { mitigate: { action: "bypass" } },
  });

  it("names an active bypass rule that sits ahead of a managed rule", () => {
    expect(bypassesAhead([RULES[0], bypass("Allow API"), RULES[1]])).toEqual([
      `Allow API bypasses ${PREFIX}shared estimates for the requests it matches`,
    ]);
  });

  it("ignores a bypass rule that comes last or is switched off, and other actions", () => {
    expect(bypassesAhead([...RULES, bypass("Allow API")])).toEqual([]);
    expect(bypassesAhead([bypass("Allow API", false), ...RULES])).toEqual([]);
    expect(bypassesAhead([{ ...bypass("Block"), action: { mitigate: { action: "deny" } } }, ...RULES])).toEqual([]);
    expect(bypassesAhead([{ ...bypass("Allow"), action: { mitigate: { action: "allow" } } }, RULES[0]])).toEqual([
      `Allow bypasses ${PREFIX}estimates for the requests it matches`,
    ]);
    expect(bypassesAhead([{ ...bypass(`${PREFIX}x`) }, ...RULES])).toEqual([]);
  });
});

describe("normalize", () => {
  it("treats Vercel's read-back forms as the same rule", () => {
    const rule = RULES[0];
    const readBack = {
      ...rule,
      id: "rule_1",
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
    const withKeys = (keys: string[]) => ({
      ...rule,
      action: { mitigate: { ...rule.action.mitigate, rateLimit: { ...rule.action.mitigate.rateLimit, keys } } },
    });
    expect(normalize(withKeys(["ja4", "ip"]))).toEqual(normalize(withKeys(["ip", "ja4"])));
  });

  it("tells apart rules that differ in what they do", () => {
    const rule = RULES[0];
    const { rateLimit } = rule.action.mitigate;
    const condition = rule.conditionGroup[0].conditions[0];
    const variants = [
      { ...rule, active: false },
      { ...rule, description: "other" },
      { ...rule, conditionGroup: [{ conditions: [{ ...condition, op: "pre" }] }] },
      { ...rule, conditionGroup: [{ conditions: [{ ...condition, value: "/api/other" }] }] },
      { ...rule, conditionGroup: [{ conditions: [{ ...condition, type: "host" }] }] },
      { ...rule, conditionGroup: [{ conditions: [condition, { ...condition, value: "/x" }] }] },
      { ...rule, conditionGroup: [{ conditions: [{ ...condition, neg: true }] }] },
      { ...rule, conditionGroup: [{ conditions: [{ ...condition, key: "x" }] }] },
      { ...rule, conditionGroup: [{ conditions: [condition] }, { conditions: [condition] }] },
      { ...rule, action: { mitigate: { ...rule.action.mitigate, action: "deny" } } },
      { ...rule, action: { mitigate: { ...rule.action.mitigate, actionDuration: "1h" } } },
      { ...rule, action: { mitigate: { ...rule.action.mitigate, redirect: { location: "/" } } } },
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
    expect(ruleMatches(rule("suf", "/run"), "/api/run")).toBe(true);
    expect(ruleMatches(rule("sub", "pi/ru"), "/api/run")).toBe(true);
    expect(ruleMatches(rule("eq", "/api/run", true), "/api/health")).toBe(true);
    expect(ruleMatches(rule("eq", "/api/run", true), "/api/run")).toBe(false);
    expect(ruleMatches(rule("re", "^/api/(run|health)$"), "/api/health")).toBe(true);
    expect(ruleMatches(rule("re", "^/api/run$"), "/API/RUN")).toBe(true);
  });

  it("selects a request that any one group of conditions matches", () => {
    const either = {
      ...RULES[0],
      conditionGroup: [
        { conditions: [{ type: "path", op: "eq", value: "/api/run" }] },
        { conditions: [{ type: "path", op: "eq", value: "/api/health" }] },
      ],
    };
    expect(ruleMatches(either, "/api/health")).toBe(true);
    expect(ruleMatches(either, "/api/other")).toBe(false);
  });

  it("refuses conditions it can't evaluate", () => {
    const byMethod = {
      ...RULES[0],
      conditionGroup: [{ conditions: [{ type: "method", op: "eq", value: "POST" }] }],
    };
    expect(() => ruleMatches(byMethod, "/api/run")).toThrow("method");
    expect(() => ruleMatches(rule("inc", "/api/run"), "/api/run")).toThrow("inc");
  });
});

describe("routes", () => {
  it("fills in dynamic segments two ways", () => {
    expect(samplePaths("/api/run")).toEqual(["/api/run"]);
    expect(samplePaths("/runs/[id]")).toEqual(["/runs/sample", "/runs/0f0e8a2c-7d1b-4c5e-9a3f-2b6d8e1c4a70"]);
    expect(samplePaths("/docs/[...slug]")).toEqual(["/docs/a", "/docs/a/b"]);
    expect(samplePaths("/docs/[[...slug]]")).toEqual(["/docs", "/docs/a/b"]);
    expect(samplePaths("/[[...slug]]")).toEqual(["/", "/a/b"]);
  });

  /** A minimal stand-in for Next's four manifests, not a real build. */
  function fakeBuild(app: Record<string, string>, pages: Record<string, string>, prerendered: string[], middleware = {}) {
    const dir = mkdtempSync(path.join(tmpdir(), "firewall-"));
    mkdirSync(path.join(dir, "server"));
    writeFileSync(path.join(dir, "app-path-routes-manifest.json"), JSON.stringify(app));
    writeFileSync(path.join(dir, "server", "pages-manifest.json"), JSON.stringify(pages));
    writeFileSync(
      path.join(dir, "prerender-manifest.json"),
      JSON.stringify({ routes: Object.fromEntries(prerendered.map((r) => [r, {}])) })
    );
    writeFileSync(path.join(dir, "server", "middleware-manifest.json"), JSON.stringify({ version: 3, middleware }));
    return dir;
  }

  it("splits a build into files and function routes", () => {
    const dir = fakeBuild(
      { "/page": "/", "/api/run/route": "/api/run", "/runs/[id]/page": "/runs/[id]" },
      { "/_app": "pages/_app.js", "/_document": "pages/_document.js", "/_error": "pages/_error.js", "/404": "pages/404.html" },
      ["/"]
    );
    expect(buildRoutes(dir)).toEqual({ functions: ["/api/run", "/runs/[id]"], files: ["/", "/404"], middleware: [] });
  });

  it("counts a Pages Router API route as a function and names middleware", () => {
    const dir = fakeBuild(
      { "/page": "/" },
      { "/_app": "pages/_app.js", "/api/legacy": "pages/api/legacy.js", "/about": "pages/about.js" },
      ["/", "/about"],
      { "/": { name: "middleware" } }
    );
    expect(buildRoutes(dir)).toEqual({ functions: ["/api/legacy"], files: ["/", "/about"], middleware: ["/"] });
    expect(routeProblems({ functions: [], files: [], middleware: ["/"] }, [])).toEqual([
      "middleware / runs a function on the requests it matches, and routes can't check those",
    ]);
  });

  it("covers each function route once and no file route", () => {
    const functions = ["/api/cron/keepalive", "/api/health", "/api/run", "/runs/[id]"];
    const files = ["/", "/404", "/_not-found", "/benchmarks", "/methodology"];
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

  it("names a rule that covers only some paths of a route", () => {
    const narrow = { ...RULES[1], conditionGroup: [{ conditions: [{ type: "path", op: "eq", value: "/runs/sample" }] }] };
    expect(routeProblems({ functions: ["/runs/[id]"], files: [] }, [narrow])).toEqual([
      "/runs/[id] runs a function and 0 rules cover it",
      `${PREFIX}shared estimates covers only some paths of /runs/[id]`,
    ]);
    const docs = { ...RULES[1], conditionGroup: [{ conditions: [{ type: "path", op: "pre", value: "/docs/" }] }] };
    expect(routeProblems({ functions: ["/docs/[[...slug]]"], files: [] }, [docs])).toContain(
      `${PREFIX}shared estimates covers only some paths of /docs/[[...slug]]`
    );
  });
});

type Config = {
  firewallEnabled: boolean;
  rules: Rule[];
  ips: Array<{ ip: string; action: string }>;
  crs: Record<string, { active: boolean; action: string }>;
};
type Draft = Config & { id: string; version: number; changes: Array<Change & { createdAt?: string }> };

const settings = () => ({ ips: [], crs: { sqli: { active: true, action: "log" }, xss: { active: false, action: "log" } } });
/** Sorts object keys, as Vercel did for the rules and changes a draft held. */
const sortKeys = <T,>(value: T): T =>
  JSON.parse(
    JSON.stringify(value, (_key, v) =>
      v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v
    )
  );
const live = (rules: Rule[] = [], firewallEnabled = true): Config => ({ firewallEnabled, rules, ...settings() });

/**
 * An in-memory stand-in for Vercel's firewall API with one shared draft. It
 * follows what probes of the live API showed on 2026-11-02: a stage returns the
 * whole draft; the draft records rule changes and IP blocks with ids, the
 * inserted rule's new one included; it records no flip of the firewall switch;
 * and removing a rule it inserted drops that rule's earlier entries. A publish
 * left no draft behind, and a new draft over an empty project started with the
 * switch on. No probe has seen a crs.update, which the fake records like an IP
 * block.
 */
function fakeVercel(
  active: Config | null,
  opts: {
    draft?: Draft;
    afterStage?: (n: number, foreign: (change: Change) => void) => void;
    failStage?: number;
    failStageAfterApply?: boolean;
    ignoreSwitch?: boolean;
    invalid?: string;
    publishDropsSwitch?: boolean;
    failPublish?: "before" | "after";
    failDiscard?: boolean;
    dropOnPublish?: string;
    editOnPublish?: string;
  } = {}
) {
  const state = {
    active,
    draft: (opts.draft ?? null) as Draft | null,
    calls: [] as string[],
  };
  const ids = { n: 0 };
  let stages = 0;
  const apply = (change: Change) => {
    const base: Draft = state.draft ?? {
      ...(structuredClone(state.active) ?? { firewallEnabled: true, rules: [], ...settings() }),
      id: "waf_1",
      version: 1,
      changes: [],
    };
    const draft = structuredClone(base);
    if (change.action === "firewallEnabled") {
      if (!opts.ignoreSwitch) draft.firewallEnabled = change.value as boolean;
    } else if (change.action === "ip.insert") {
      draft.ips.push(change.value as Config["ips"][number]);
      draft.changes.push({ ...change, createdAt: "t" });
    } else if (change.action === "crs.update") {
      draft.crs = { ...draft.crs, [change.id!]: change.value as Config["crs"][string] };
      draft.changes.push({ ...change, createdAt: "t" });
    } else if (change.action === "rules.remove" && draft.changes.some((c) => c.action === "rules.insert" && c.id === change.id)) {
      draft.rules = draft.rules.filter((r) => r.id !== change.id);
      draft.changes = draft.changes.filter((c) => c.id !== change.id);
    } else {
      draft.rules = stageAll(draft.rules, [change], ids).map((r) =>
        sortKeys({ ...r, valid: r.name !== opts.invalid, validationErrors: r.name === opts.invalid ? ["quota"] : null })
      );
      const id = change.action === "rules.insert" ? draft.rules.at(-1)!.id! : change.id;
      draft.changes.push(sortKeys({ ...change, id, createdAt: "t" }));
    }
    state.draft = draft;
  };
  const client = {
    async configs() {
      state.calls.push("configs");
      return structuredClone({ active: state.active, draft: state.draft, versions: [] });
    },
    async stage(change: Change) {
      state.calls.push(`stage ${change.action}`);
      stages += 1;
      if (opts.failStage === stages && !opts.failStageAfterApply) throw new Error("HTTP 502");
      apply(change);
      if (opts.failStage === stages) throw new Error("The operation was aborted due to timeout");
      opts.afterStage?.(stages, apply);
      return structuredClone(state.draft);
    },
    async publish() {
      state.calls.push("publish");
      if (opts.failPublish === "before") throw new Error("HTTP 500");
      const { firewallEnabled, rules, ips, crs } = state.draft!;
      state.active = {
        firewallEnabled: firewallEnabled && !opts.publishDropsSwitch,
        ips,
        crs,
        rules: rules
          .map((r) => Object.fromEntries(Object.entries(r).filter(([key]) => !key.startsWith("valid"))) as Rule)
          .filter((r) => r.name !== opts.dropOnPublish)
          .map((r) => (r.name === opts.editOnPublish ? { ...r, active: !r.active } : r)),
      };
      state.draft = null;
      if (opts.failPublish === "after") throw new Error("The operation was aborted due to timeout");
    },
    async discard() {
      state.calls.push("discard");
      if (opts.failDiscard) throw new Error("HTTP 503");
      state.draft = null;
    },
  };
  return { client, state };
}

const quiet = () => {};
const dashboardRule: Rule = { ...RULES[1], id: "dash_1", name: "Block bots" };
const insertedNames = (state: { active: Config | null }) => managedOf(state.active?.rules ?? []).map((r) => r.name);

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
    const { client, state } = fakeVercel(live([dashboardRule]));
    const changes = await applyRules({ client, log: quiet, publish: false });
    expect(changes).toHaveLength(RULES.length);
    expect(state.calls).not.toContain("publish");
    expect(state.calls.at(-1)).toBe("discard");
    expect(state.active).toEqual(live([dashboardRule]));
    expect(state.draft).toBeNull();
  });

  it("changes nothing when the live rules match, even with a draft pending", async () => {
    const { client, state } = fakeVercel(null);
    await applyRules({ client, log: quiet });
    const pending: Draft = { ...structuredClone(state.active!), id: "w", version: 2, changes: [], firewallEnabled: false };
    state.draft = pending;
    state.calls = [];
    expect(await applyRules({ client, log: quiet })).toEqual([]);
    expect(state.calls).toEqual(["configs"]);
    expect(state.draft).toEqual(pending);
  });

  it("refuses to report a match while Vercel marks a live rule invalid", async () => {
    const rules = RULES.map((r, i) => ({ ...r, id: `r${i}`, ...(i === 0 ? { valid: false } : {}) }));
    const { client } = fakeVercel(live(rules));
    await expect(applyRules({ client, log: quiet })).rejects.toThrow(`invalid: ${PREFIX}estimates`);
  });

  it("keeps a rule someone added in the dashboard", async () => {
    const { client, state } = fakeVercel(live([dashboardRule]));
    await applyRules({ client, log: quiet });
    expect(state.active!.rules[0]).toEqual(dashboardRule);
    expect(canonical(managedOf(state.active!.rules))).toEqual(canonical(RULES));
  });

  it("warns about a dashboard bypass rule ahead of the limits", async () => {
    const bypass = { ...dashboardRule, action: { mitigate: { action: "bypass" } } } as unknown as Rule;
    const { client } = fakeVercel(live([bypass, ...RULES.map((r, i) => ({ ...r, id: `r${i}` }))]));
    const lines: string[] = [];
    await applyRules({ client, log: (line: string) => lines.push(line) });
    expect(lines[0]).toMatch(/^warning: Block bots bypasses/);
  });

  describe("refuses to start while the draft holds work that isn't live", () => {
    const cases: Array<[string, Config | null, Draft]> = [
      [
        "a recorded rule change",
        live([dashboardRule]),
        { ...live([]), id: "w", version: 2, changes: [{ action: "rules.remove", id: "dash_1", value: null }] },
      ],
      ["a firewall switch, which Vercel doesn't record", live([dashboardRule], false), { ...live([dashboardRule], true), id: "w", version: 2, changes: [] }],
      ["a draft over nothing live", null, { ...live([]), id: "w", version: 1, changes: [] }],
      [
        "a recorded change that leaves the rules as they were",
        live([dashboardRule]),
        { ...live([dashboardRule]), id: "w", version: 2, changes: [{ action: "rules.update", id: "dash_1", value: dashboardRule }] },
      ],
      [
        "an edited rule with no recorded change",
        live([dashboardRule]),
        { ...live([{ ...dashboardRule, active: false }]), id: "w", version: 2, changes: [] },
      ],
    ];
    for (const [name, active, draft] of cases) {
      it(name, async () => {
        const { client, state } = fakeVercel(active, { draft });
        await expect(applyRules({ client, log: quiet })).rejects.toThrow("aren't live");
        expect(state.calls).toEqual(["configs"]);
        expect(state.draft).toEqual(draft);
      });
    }
  });

  it("starts over a leftover draft that matches what's live", async () => {
    const active = live([dashboardRule]);
    const leftover = {
      id: "w",
      version: 3,
      changes: [],
      rules: [sortKeys({ ...dashboardRule, valid: true, validationErrors: null })],
      crs: { xss: active.crs.xss, sqli: active.crs.sqli },
      ips: [],
      firewallEnabled: true,
    };
    const { client, state } = fakeVercel(active, { draft: leftover });
    await applyRules({ client, log: quiet });
    expect(canonical(managedOf(state.active!.rules))).toEqual(canonical(RULES));
  });

  describe("publishes nothing when someone else stages work mid-run, and leaves their work in place", () => {
    const foreign: Array<[string, Change, number]> = [
      ["a rule edit", { action: "rules.update", id: "dash_1", value: { ...dashboardRule, active: false } }, 1],
      ["an IP block", { action: "ip.insert", id: null, value: { ip: "203.0.113.7", action: "deny" } }, 2],
      ["a managed ruleset change", { action: "crs.update", id: "xss", value: { active: true, action: "deny" } }, 3],
      ["a firewall switch", { action: "firewallEnabled", id: null, value: false }, 4],
      ["a removal of a rule this run inserted, which Vercel folds into the insert", { action: "rules.remove", id: "new_0", value: null }, 2],
    ];
    for (const [name, change, at] of foreign) {
      it(name, async () => {
        const { client, state } = fakeVercel(live([dashboardRule]), {
          afterStage: (n, stage) => n === at && stage(change),
        });
        await expect(applyRules({ client, log: quiet })).rejects.toThrow("The draft stays in Vercel");
        expect(state.calls).not.toContain("publish");
        expect(state.calls).not.toContain("discard");
        expect(state.draft).not.toBeNull();
        expect(state.active).toEqual(live([dashboardRule]));
      });
    }
  });

  it("discards its own draft when publishing fails", async () => {
    const { client, state } = fakeVercel(null, { failPublish: "before" });
    await expect(applyRules({ client, log: quiet })).rejects.toThrow(
      `HTTP 500 This run discarded its draft of ${RULES.length + 1} changes.`
    );
    expect(state.calls.at(-1)).toBe("discard");
    expect(state.draft).toBeNull();
    expect(state.active).toBeNull();
  });

  it("reports success when the publish went through but its response failed", async () => {
    const { client, state } = fakeVercel(null, { failPublish: "after" });
    const lines: string[] = [];
    await expect(applyRules({ client, log: (line: string) => lines.push(line) })).resolves.toHaveLength(
      RULES.length + 1
    );
    expect(lines.at(-1)).toMatch(/answered the publish with an error .* but the rules went live/);
    expect(insertedNames(state)).toEqual(RULES.map((r) => r.name));
    expect(state.calls).not.toContain("discard");
  });

  it("discards a half-staged draft when a stage fails", async () => {
    const { client, state } = fakeVercel(live([dashboardRule]), { failStage: 3 });
    await expect(applyRules({ client, log: quiet })).rejects.toThrow(
      "HTTP 502 This run discarded its draft of 2 changes."
    );
    expect(state.draft).toBeNull();
    expect(state.active).toEqual(live([dashboardRule]));
  });

  it("says so when it can't clear a half-staged draft", async () => {
    const { client, state } = fakeVercel(live([dashboardRule]), { failStage: 3, failDiscard: true });
    await expect(applyRules({ client, log: quiet })).rejects.toThrow("couldn't clear its draft (HTTP 503)");
    expect(state.draft?.changes).toHaveLength(2);
  });

  it("leaves the draft when its first stage fails, since it can't tell whose it is", async () => {
    const { client, state } = fakeVercel(null, { failStage: 1 });
    await expect(applyRules({ client, log: quiet })).rejects.toThrow("HTTP 502 No draft remains.");
    expect(state.calls).not.toContain("discard");
  });

  it("leaves the draft when its first stage reached Vercel but the answer was lost", async () => {
    const { client, state } = fakeVercel(null, { failStage: 1, failStageAfterApply: true });
    await expect(applyRules({ client, log: quiet })).rejects.toThrow(
      "timeout The draft stays in Vercel, because this run has no answer from its first stage"
    );
    expect(state.calls).not.toContain("discard");
    expect(state.draft?.firewallEnabled).toBe(true);
  });

  it("publishes nothing when Vercel leaves the firewall off in the draft", async () => {
    const { client, state } = fakeVercel(live([], false), { ignoreSwitch: true });
    await expect(applyRules({ client, log: quiet })).rejects.toThrow("firewall disabled");
    expect(state.calls).not.toContain("publish");
    expect(state.draft).toBeNull();
  });

  it("publishes nothing when Vercel marks a staged rule invalid", async () => {
    const { client, state } = fakeVercel(live([]), { invalid: `${PREFIX}health` });
    await expect(applyRules({ client, log: quiet })).rejects.toThrow(`invalid: ${PREFIX}health`);
    expect(state.calls).not.toContain("publish");
    expect(state.active).toEqual(live([]));
  });

  it("fails when the firewall is off after publishing", async () => {
    const { client } = fakeVercel(null, { publishDropsSwitch: true });
    await expect(applyRules({ client, log: quiet })).rejects.toThrow(
      "The live configuration doesn't match: firewall disabled."
    );
  });

  it("fails a dry run whose draft it can't discard", async () => {
    const { client } = fakeVercel(null, { failDiscard: true });
    await expect(applyRules({ client, log: quiet, publish: false })).rejects.toThrow("couldn't clear its draft");
  });

  it("fails when the published config doesn't hold every rule", async () => {
    const { client } = fakeVercel(null, { dropOnPublish: `${PREFIX}health` });
    await expect(applyRules({ client, log: quiet })).rejects.toThrow(`missing: ${PREFIX}health`);
  });

  it("says when Vercel keeps a draft after publishing", async () => {
    const { client, state } = fakeVercel(null);
    const publish = client.publish;
    client.publish = async () => {
      await publish();
      state.draft = { ...structuredClone(state.active!), id: "w", version: 9, changes: [] };
    };
    const lines: string[] = [];
    await applyRules({ client, log: (line: string) => lines.push(line) });
    expect(lines.slice(-2)).toEqual([
      "Vercel kept a draft after publishing, with 0 recorded changes.",
      `Published ${RULES.length + 1} changes.`,
    ]);
  });

  it("fails when a rule outside its names changed on the way to production", async () => {
    const { client } = fakeVercel(live([dashboardRule]), { editOnPublish: "Block bots" });
    await expect(applyRules({ client, log: quiet })).rejects.toThrow("other rules changed");
  });
});

describe("vercelClient", () => {
  it("sends the CLI's requests and reports a refusal with its status", async () => {
    const sent: Array<{ url: string; method: string; body?: string; headers: Headers }> = [];
    const signals: unknown[] = [];
    const fetchFn = async (url: string, init: RequestInit) => {
      sent.push({ url, method: init.method!, body: init.body as string | undefined, headers: new Headers(init.headers) });
      signals.push(init.signal);
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
    expect(sent.map((s) => s.body)).toEqual([
      undefined,
      JSON.stringify({ action: "rules.remove", id: "r1", value: null }),
      "{}",
      undefined,
    ]);
    expect(sent.map((s) => s.headers.get("content-type"))).toEqual([
      null,
      "application/json",
      "application/json",
      null,
    ]);
    expect(sent.every((s) => s.headers.get("authorization") === "Bearer t0ken")).toBe(true);
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
  });

  it("reads an empty answer as null", async () => {
    const fetchFn = async () => new Response("", { status: 200 });
    expect(await vercelClient({ token: "t", fetchFn: fetchFn as typeof fetch }).discard()).toBeNull();
  });
});
