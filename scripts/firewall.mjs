// Per-address request limits that Vercel's firewall applies before a request
// reaches one of HiveSight's functions. The app refuses a flood on its own, but
// each refusal still takes an `admit` slot, a pooled database connection and
// egress. These rules make the edge refuse it first.
//
//   node scripts/firewall.mjs routes   checks the build: one rule per function route
//   node scripts/firewall.mjs check    compares the live rules with RULES
//   node scripts/firewall.mjs dry-run  stages RULES, checks the draft, then discards it
//   node scripts/firewall.mjs apply    stages, publishes and reads back RULES
//
// `check`, `dry-run` and `apply` need VERCEL_TOKEN. They change only rules named with
// PREFIX, so rules someone adds in the dashboard under another name stay.
// This file runs with plain Node, so it imports only Node's own modules.

import { readFileSync } from "node:fs";
import path from "node:path";

export const PROJECT_ID = "prj_TWAQsAF7qNZpWMLx6Lhvd7YwyZgu";
export const TEAM_ID = "team_o3QtvpZGRAXmvhbyKiMh7ZGv";
export const PREFIX = "hivesight: ";
// Vercel's Pro plan counts in fixed windows of 10 seconds to 10 minutes, keyed
// by address or TLS fingerprint. A fingerprint key would let one client shut out
// every visitor whose browser shares it, so each rule keys by address.
export const WINDOW_SECONDS = 60;
const REQUEST_TIMEOUT_MS = 30_000;

function perAddress(name, condition, limit, description) {
  return {
    name: PREFIX + name,
    description: `${description} Defined in scripts/firewall.mjs.`,
    active: true,
    conditionGroup: [{ conditions: [condition] }],
    action: {
      mitigate: {
        action: "rate_limit",
        rateLimit: {
          algo: "fixed_window",
          window: WINDOW_SECONDS,
          limit,
          keys: ["ip"],
          action: "rate_limit",
        },
        redirect: null,
        actionDuration: null,
      },
    },
  };
}

export const RULES = [
  // The form sends one estimate at a time, an estimate takes 10 seconds or
  // more, and route.ts runs two at once for a network. Ten a minute leaves room
  // to retry after a refusal.
  perAddress(
    "estimates",
    { type: "path", op: "eq", value: "/api/run" },
    10,
    "Ten requests a minute for each address."
  ),
  // Each view of a shared link reads the database once. 120 covers a link
  // shared around an office that reaches the site through one address.
  perAddress(
    "shared estimates",
    { type: "path", op: "pre", value: "/runs/" },
    120,
    "120 page views a minute for each address."
  ),
  // The outside monitor sends at most three requests every 15 minutes, and each
  // request can take the site lock through the store ping.
  perAddress(
    "health",
    { type: "path", op: "eq", value: "/api/health" },
    20,
    "Twenty checks a minute for each address."
  ),
  // Vercel's cron calls this once a day.
  perAddress(
    "keepalive",
    { type: "path", op: "eq", value: "/api/cron/keepalive" },
    5,
    "Five calls a minute for each address."
  ),
];

const managed = (rule) => typeof rule?.name === "string" && rule.name.startsWith(PREFIX);

/** The fields Vercel accepts for a rule, in the shape the CLI sends. */
function body(rule) {
  const { name, description, active, conditionGroup, action } = rule;
  return { name, description, active, conditionGroup, action };
}

/** A rule's meaning, so a rule read back from Vercel compares equal to its source. */
export function normalize(rule) {
  const mitigate = rule.action?.mitigate ?? {};
  const rateLimit = mitigate.rateLimit;
  return {
    name: rule.name,
    description: rule.description ?? "",
    active: rule.active === true,
    conditionGroup: (rule.conditionGroup ?? []).map((group) => ({
      conditions: (group.conditions ?? []).map((c) => ({
        type: c.type,
        op: c.op,
        neg: c.neg === true,
        key: c.key ?? null,
        value: c.value ?? null,
      })),
    })),
    action: {
      action: mitigate.action ?? null,
      rateLimit: rateLimit
        ? {
            algo: rateLimit.algo,
            window: Number(rateLimit.window),
            limit: Number(rateLimit.limit),
            keys: [...(rateLimit.keys ?? [])].sort(),
            action: rateLimit.action ?? "rate_limit",
          }
        : null,
      redirect: mitigate.redirect ?? null,
      actionDuration: mitigate.actionDuration ?? null,
    },
  };
}

const same = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

/**
 * The draft changes that turn the managed rules in `current` into `desired`.
 * It updates a rule in place by name, removes a managed rule that `desired`
 * lacks or that repeats a name, and never names a rule outside PREFIX.
 */
export function plan(current, desired = RULES) {
  const kept = new Set();
  const changes = [];
  for (const rule of current.filter(managed)) {
    const want = desired.find((d) => d.name === rule.name);
    if (!want || kept.has(rule.name)) {
      changes.push({ action: "rules.remove", id: rule.id, value: null });
      continue;
    }
    kept.add(rule.name);
    if (!same(rule, want)) changes.push({ action: "rules.update", id: rule.id, value: body(want) });
  }
  for (const want of desired) {
    if (!kept.has(want.name)) changes.push({ action: "rules.insert", id: null, value: body(want) });
  }
  return changes;
}

/** Lines that describe how the live managed rules differ from `desired`. */
export function drift(rules, desired = RULES) {
  const live = rules.filter(managed);
  const lines = [];
  for (const want of desired) {
    const found = live.filter((r) => r.name === want.name);
    if (found.length === 0) lines.push(`missing: ${want.name}`);
    else if (found.length > 1) lines.push(`repeated ${found.length} times: ${want.name}`);
    else if (!same(found[0], want)) lines.push(`differs: ${want.name}`);
    if (found.some((r) => r.active !== true)) lines.push(`disabled: ${want.name}`);
  }
  for (const rule of live) {
    if (!desired.some((d) => d.name === rule.name)) lines.push(`unexpected: ${rule.name}`);
  }
  return lines;
}

function conditionMatches(condition, requestPath) {
  if (condition.type !== "path") {
    throw new Error(`routes can't check a ${condition.type} condition`);
  }
  // Vercel compares without regard to case.
  const subject = requestPath.toLowerCase();
  const value = String(condition.value).toLowerCase();
  const hit = {
    eq: () => subject === value,
    pre: () => subject.startsWith(value),
    suf: () => subject.endsWith(value),
    sub: () => subject.includes(value),
    re: () => new RegExp(String(condition.value), "i").test(requestPath),
  }[condition.op];
  if (!hit) throw new Error(`routes can't check the ${condition.op} operator`);
  return hit() !== (condition.neg === true);
}

/** Whether a rule's conditions select a request to `requestPath`. */
export function ruleMatches(rule, requestPath) {
  return rule.conditionGroup.some((group) =>
    group.conditions.every((condition) => conditionMatches(condition, requestPath))
  );
}

/** A request path for an app route, with each dynamic segment filled in. */
export function samplePath(route) {
  return route.replace(/\[\[?\.\.\.[^\]]+\]?\]/g, "a/b").replace(/\[[^\]]+\]/g, "sample");
}

/** Splits the build's app routes into those served as files and those a function serves. */
export function buildRoutes(nextDir) {
  const read = (name) => JSON.parse(readFileSync(path.join(nextDir, name), "utf8"));
  const all = [...new Set(Object.values(read("app-path-routes-manifest.json")))];
  const prerendered = new Set(Object.keys(read("prerender-manifest.json").routes));
  return {
    functions: all.filter((route) => !prerendered.has(route)).sort(),
    files: all.filter((route) => prerendered.has(route)).sort(),
  };
}

/**
 * Problems with the rules for a build: a function route that no rule or two
 * rules cover, a file route that a rule covers, or a rule that covers nothing.
 */
export function routeProblems({ functions, files }, rules = RULES) {
  const problems = [];
  const covering = (route) => rules.filter((rule) => ruleMatches(rule, samplePath(route)));
  for (const route of functions) {
    const found = covering(route);
    if (found.length !== 1) {
      problems.push(`${route} runs a function and ${found.length} rules cover it`);
    }
  }
  for (const route of files) {
    for (const rule of covering(route)) problems.push(`${route} is a file and ${rule.name} covers it`);
  }
  for (const rule of rules) {
    if (!functions.some((route) => ruleMatches(rule, samplePath(route)))) {
      problems.push(`${rule.name} covers no function route`);
    }
  }
  return problems;
}

export function vercelClient({ token, projectId = PROJECT_ID, teamId = TEAM_ID, fetchFn = fetch }) {
  const query = new URLSearchParams({ projectId, teamId }).toString();
  async function call(method, route, payload) {
    const response = await fetchFn(`https://api.vercel.com${route}?${query}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(payload === undefined ? {} : { "content-type": "application/json" }),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Vercel ${method} ${route}: HTTP ${response.status} ${text.slice(0, 300)}`);
    }
    return text ? JSON.parse(text) : null;
  }
  return {
    /** The active configuration and the unpublished draft, either of which may be null. */
    configs: () => call("GET", "/v1/security/firewall/config"),
    stage: (change) => call("PATCH", "/v1/security/firewall/config/draft", change),
    publish: () => call("POST", "/v1/security/firewall/config/draft/activate", {}),
    discard: () => call("DELETE", "/v1/security/firewall/config/draft"),
  };
}

const unmanagedOf = (config) => JSON.stringify((config?.rules ?? []).filter((r) => !managed(r)));

function confirm(config, desired, baseline, label) {
  const problems = drift(config?.rules ?? [], desired);
  if (config?.firewallEnabled !== true) problems.push("firewall disabled");
  if (unmanagedOf(config) !== unmanagedOf(baseline)) problems.push("other rules changed");
  if (problems.length) throw new Error(`The ${label} configuration doesn't match: ${problems.join("; ")}`);
}

/**
 * Stages the changes, checks the draft, publishes it, and checks what went live.
 * It refuses to start while someone else's changes wait in the draft, because
 * publishing would publish those too, and it discards its draft if a step fails
 * before publishing. With `publish` false it discards the checked draft instead.
 */
export async function applyRules({ client, desired = RULES, log = console.log, publish = true }) {
  const { active, draft } = await client.configs();
  if (draft?.changes?.length) {
    throw new Error(
      "The firewall draft holds unpublished changes. Publish or discard them in Vercel, then run this again."
    );
  }
  const changes = plan(active?.rules ?? [], desired);
  if (active?.firewallEnabled !== true) {
    changes.unshift({ action: "firewallEnabled", id: null, value: true });
  }
  if (changes.length === 0) {
    log("The live firewall already matches RULES.");
    return [];
  }
  try {
    for (const change of changes) {
      log(`stage ${change.action} ${change.value?.name ?? change.id ?? ""}`.trim());
      await client.stage(change);
    }
    confirm((await client.configs()).draft, desired, active, "draft");
    if (!publish) {
      await client.discard();
      log(`The draft held all ${changes.length} changes, and this run discarded it.`);
      return changes;
    }
    await client.publish();
  } catch (err) {
    await client.discard().catch(() => {});
    throw err;
  }
  confirm((await client.configs()).active, desired, active, "active");
  log(`Published ${changes.length} changes.`);
  return changes;
}

async function main(command) {
  if (command === "routes") {
    const problems = routeProblems(buildRoutes(path.resolve(".next")));
    for (const problem of problems) console.error(problem);
    if (problems.length) process.exit(1);
    console.log("Each function route has one edge limit, and no file route has one.");
    return;
  }
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error("Set VERCEL_TOKEN to a token with access to the project's team.");
  const client = vercelClient({ token });
  if (command === "check") {
    const { active } = await client.configs();
    const problems = drift(active?.rules ?? []);
    if (active?.firewallEnabled !== true) problems.push("firewall disabled");
    for (const problem of problems) console.error(problem);
    if (problems.length) process.exit(1);
    console.log("The live firewall matches RULES.");
  } else if (command === "apply" || command === "dry-run") {
    await applyRules({ client, publish: command === "apply" });
  } else {
    throw new Error("Use routes, check, dry-run or apply.");
  }
}

if (process.argv[1]?.endsWith("firewall.mjs")) await main(process.argv[2]);
