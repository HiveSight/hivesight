// Per-address request limits that Vercel's firewall applies before a request
// reaches one of HiveSight's functions. The app refuses a flood on its own, but
// only after a function starts, and often after a database read. A flood from
// many addresses still reaches the app.
//
//   node scripts/firewall.mjs routes   checks the build: one rule for each function route
//   node scripts/firewall.mjs check    compares the live rules with RULES
//   node scripts/firewall.mjs dry-run  stages RULES, checks the draft, then discards it
//   node scripts/firewall.mjs apply    stages, publishes and reads back RULES
//
// `check`, `dry-run` and `apply` need VERCEL_TOKEN. `apply` switches the firewall
// on when it's off, which also switches on any rule, IP block or managed ruleset
// someone set up in the dashboard. Apart from that it changes only rules whose
// names start with PREFIX, and it discards a draft only when the draft holds
// nothing but this run's changes.
// This file runs with plain Node, so it imports only Node's own modules.

import { readFileSync } from "node:fs";
import path from "node:path";

export const PROJECT_ID = "prj_TWAQsAF7qNZpWMLx6Lhvd7YwyZgu";
export const TEAM_ID = "team_o3QtvpZGRAXmvhbyKiMh7ZGv";
export const PREFIX = "hivesight: ";
// On the Pro plan, Vercel counts in fixed windows of 10 seconds to 10 minutes and
// keys each count by address or TLS fingerprint. A fingerprint key would let one
// client shut out every visitor whose browser shares it, so each rule keys by
// address. Vercel keeps a separate count in each region.
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
  // The form sends one estimate at a time, and each takes 10 seconds or more, so
  // ten a minute leaves room to retry after a refusal. On each instance, route.ts
  // also runs at most two at once for an address.
  perAddress(
    "estimates",
    { type: "path", op: "eq", value: "/api/run" },
    10,
    "Ten requests a minute for each address."
  ),
  // Each view of a shared link reads the database once. 120 covers an office
  // that passes a link around and reaches the site through one address.
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

/** Writes a value as JSON and sorts each object's keys, so two readings of one value compare equal. */
function canonical(value) {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v
  );
}

/** A rule's meaning, so a rule the script reads back from Vercel compares equal to its source. */
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
  const names = desired.map((d) => d.name);
  if (!desired.every(managed) || new Set(names).size !== names.length) {
    throw new Error(`Each desired rule needs its own name, starting with "${PREFIX}".`);
  }
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
    // Vercel can flag a rule with valid: false or validationErrors. Its docs don't
    // say what it does with one.
    if (found.some((r) => r.valid === false || (r.validationErrors?.length ?? 0) > 0)) {
      lines.push(`invalid: ${want.name}`);
    }
  }
  for (const rule of live) {
    if (!desired.some((d) => d.name === rule.name)) lines.push(`unexpected: ${rule.name}`);
  }
  return lines;
}

// Vercel skips the remaining custom rules for a request a bypass rule matches.
// Its API also lists an allow action, which its docs don't describe.
const SKIPS_LATER_RULES = new Set(["bypass", "allow"]);

/**
 * Active dashboard rules that may skip the limits for the requests they match:
 * a bypass or allow rule that sits ahead of a managed rule.
 */
export function bypassesAhead(rules) {
  const lines = [];
  rules.forEach((rule, i) => {
    if (managed(rule) || rule?.active !== true || !SKIPS_LATER_RULES.has(rule?.action?.mitigate?.action)) return;
    const later = rules.slice(i + 1).filter(managed).map((r) => r.name);
    if (later.length) lines.push(`${rule.name} bypasses ${later.join(", ")} for the requests it matches`);
  });
  return lines;
}

function conditionMatches(condition, requestPath) {
  if (condition.type !== "path") {
    throw new Error(`routes can't check a ${condition.type} condition`);
  }
  // Vercel's docs say every operator ignores case.
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

// Two values for each dynamic segment, so a rule that covers only one spelling of
// a route fails the check. The second has the shape of a run id.
const FILLERS = ["sample", "0f0e8a2c-7d1b-4c5e-9a3f-2b6d8e1c4a70"];

/**
 * Request paths that reach an app route. The function fills each dynamic segment
 * two ways, gives a catch-all one segment and then two, and leaves an optional
 * catch-all empty.
 */
export function samplePaths(route) {
  const short =
    route
      .replace(/\/\[\[\.\.\.[^\]]+\]\]/g, "")
      .replace(/\[\.\.\.[^\]]+\]/g, "a")
      .replace(/\[[^\]]+\]/g, FILLERS[0]) || "/";
  const long = route.replace(/\[\[?\.\.\.[^\]]+\]?\]/g, "a/b").replace(/\[[^\]]+\]/g, FILLERS[1]);
  return [...new Set([short, long])];
}

/**
 * Splits the build's routes into those Next serves as files and those a function
 * serves. It also names any middleware, which runs a function on the requests it
 * matches.
 */
export function buildRoutes(nextDir) {
  const read = (name) => JSON.parse(readFileSync(path.join(nextDir, name), "utf8"));
  const appRoutes = Object.values(read("app-path-routes-manifest.json"));
  // Next's own _app, _document and _error serve no route, and an .html entry
  // points to a static file.
  const pages = Object.entries(read("server/pages-manifest.json")).filter(([route]) => !route.startsWith("/_"));
  const staticPages = pages.filter(([, file]) => file.endsWith(".html")).map(([route]) => route);
  const pageRoutes = pages.filter(([, file]) => !file.endsWith(".html")).map(([route]) => route);
  const all = [...new Set([...appRoutes, ...pageRoutes])];
  const prerendered = new Set(Object.keys(read("prerender-manifest.json").routes));
  return {
    functions: all.filter((route) => !prerendered.has(route)).sort(),
    files: [...new Set([...all.filter((route) => prerendered.has(route)), ...staticPages])].sort(),
    middleware: Object.keys(read("server/middleware-manifest.json").middleware ?? {}),
  };
}

/**
 * Problems with the rules for a build: a function route that no rule or more
 * than one rule covers, a rule that covers only some of a route's paths, a file
 * route that a rule covers, a rule that covers nothing, or middleware.
 * @param {{ functions: string[], files: string[], middleware?: string[] }} build
 */
export function routeProblems(build, rules = RULES) {
  const { functions, files, middleware = [] } = build;
  const problems = middleware.map(
    (name) => `middleware ${name} runs a function on the requests it matches, and routes can't check those`
  );
  const matches = (rule, route) => samplePaths(route).map((p) => ruleMatches(rule, p));
  for (const route of functions) {
    const covering = rules.filter((rule) => matches(rule, route).every(Boolean));
    if (covering.length !== 1) {
      problems.push(`${route} runs a function and ${covering.length} rules cover it`);
    }
    for (const rule of rules) {
      if (!covering.includes(rule) && matches(rule, route).some(Boolean)) {
        problems.push(`${rule.name} covers only some paths of ${route}`);
      }
    }
  }
  for (const route of files) {
    for (const rule of rules) {
      if (matches(rule, route).some(Boolean)) problems.push(`${route} is a file and ${rule.name} covers it`);
    }
  }
  for (const rule of rules) {
    if (!functions.some((route) => matches(rule, route).some(Boolean))) {
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
    /** Adds one change to the draft and returns the draft. */
    stage: (change) => call("PATCH", "/v1/security/firewall/config/draft", change),
    publish: () => call("POST", "/v1/security/firewall/config/draft/activate", {}),
    discard: () => call("DELETE", "/v1/security/firewall/config/draft"),
  };
}

// Vercel adds these to the rules a draft holds.
const VALIDITY = new Set(["valid", "validationErrors"]);
const withoutValidity = (rule) =>
  rule && typeof rule === "object"
    ? Object.fromEntries(Object.entries(rule).filter(([key]) => !VALIDITY.has(key)))
    : rule;
const rulesOf = (config, keep = () => true) =>
  canonical((config?.rules ?? []).filter(keep).map(withoutValidity));
const unmanagedOf = (config) => rulesOf(config, (r) => !managed(r));

// Fields that describe a copy of the configuration rather than the firewall.
const BOOKKEEPING = new Set(["id", "version", "updatedAt", "createdAt", "ownerId", "projectKey", "changes", "rules"]);
/** Everything a configuration holds apart from its rules: the switch, Vercel's managed rulesets and IP blocks. */
const settingsOf = (config) =>
  canonical(Object.fromEntries(Object.entries(config ?? {}).filter(([key]) => !BOOKKEEPING.has(key))));

/**
 * What a change does, whether this script sent it or the draft recorded it.
 * Vercel gives an inserted rule its id, so inserts compare by value alone. In
 * probes on November 2, the draft recorded rule changes and IP blocks but no flip
 * of the firewall switch. So this function drops switch changes, and
 * `foreignChanges` catches a flip by comparing settings. When someone removes a
 * rule that an earlier change in the same draft inserted, the draft drops that
 * rule's earlier entries. `plan` never asks for both in one run.
 */
function ruleChanges(changes) {
  return changes
    .filter((c) => c?.action !== "firewallEnabled")
    .map(({ action, id, value }) => {
      if (action === "rules.insert") return canonical([action, normalize(value)]);
      if (action === "rules.update") return canonical([action, id, normalize(value)]);
      if (action === "rules.remove") return canonical([action, id]);
      return canonical([action, id, value]);
    });
}

/** Ways the draft differs from the live configuration before this run stages anything. */
function pendingChanges(active, draft) {
  if (!draft) return [];
  const problems = [];
  if (draft.changes?.length) problems.push(`it records ${draft.changes.length} changes`);
  if (!active) {
    problems.push("it exists while nothing is live");
  } else {
    if (settingsOf(draft) !== settingsOf(active)) problems.push("its settings differ from the live ones");
    if (rulesOf(draft) !== rulesOf(active)) problems.push("its rules differ from the live ones");
  }
  return problems;
}

/**
 * Ways the draft may hold more than the changes this run staged. The draft may
 * record changes this run didn't send, or its settings may have moved after
 * Vercel answered this run's first stage.
 */
function foreignChanges(draft, staged, settings) {
  const problems = [];
  if (canonical(ruleChanges(draft?.changes ?? [])) !== canonical(ruleChanges(staged))) {
    problems.push("the changes it records don't match the ones this run staged");
  }
  if (settings === undefined) {
    problems.push("this run has no answer from its first stage to compare its settings with");
  } else if (settingsOf(draft) !== settings) {
    problems.push("its settings changed after this run's first stage");
  }
  return problems;
}

/** Problems with a configuration that should hold `desired` and `baseline`'s other rules. */
function configProblems(config, desired, baseline) {
  const problems = drift(config?.rules ?? [], desired);
  if (config?.firewallEnabled !== true) problems.push("firewall disabled");
  if (unmanagedOf(config) !== unmanagedOf(baseline)) problems.push("other rules changed");
  return problems;
}

/**
 * Stages the changes, checks the draft, publishes it, and checks what went live.
 * Vercel keeps one draft for the project and publishes all of it, so the run
 * refuses to start while the draft holds anything the live configuration doesn't.
 * It publishes only when the draft holds this run's changes and nothing else.
 * After a failure, it discards the draft only when the draft holds nothing but
 * this run's changes. With `publish` false, it discards the checked draft instead.
 *
 * Some dashboard edits can still slip past these checks. One that lands between
 * the final check and the publish call goes live with the rules. The run throws
 * away one that lands between its last read of the draft and the discard. And the
 * draft doesn't record some changes, such as a flip of the firewall switch. If
 * one lands before Vercel answers the first stage, it joins the settings this run
 * compares against.
 */
export async function applyRules({ client, desired = RULES, log = console.log, publish = true }) {
  const { active, draft } = await client.configs();
  for (const line of bypassesAhead(active?.rules ?? [])) log(`warning: ${line}`);
  const changes = plan(active?.rules ?? [], desired);
  if (active?.firewallEnabled !== true) {
    changes.unshift({ action: "firewallEnabled", id: null, value: true });
  }
  if (changes.length === 0) {
    const left = drift(active?.rules ?? [], desired);
    if (left.length) throw new Error(`Nothing to stage, but the live rules don't match: ${left.join("; ")}.`);
    log("The live firewall already matches RULES.");
    return [];
  }
  const pending = pendingChanges(active, draft);
  if (pending.length) {
    throw new Error(
      `The firewall draft holds changes that aren't live: ${pending.join("; ")}. ` +
        "Publish or discard them in Vercel, then run this again."
    );
  }

  const staged = [];
  let settings;
  /** Discards the draft if it holds only this run's changes, and says what happened. */
  async function cleanUp() {
    try {
      const { draft: now } = await client.configs();
      if (!now) return { cleared: true, note: "No draft remains." };
      const foreign = foreignChanges(now, staged, settings);
      if (foreign.length) {
        return { cleared: false, note: `The draft stays in Vercel, because ${foreign.join(" and ")}.` };
      }
      await client.discard();
      return { cleared: true, note: `This run discarded its draft of ${staged.length} changes.` };
    } catch (err) {
      return {
        cleared: false,
        note: `This run couldn't clear its draft (${err.message}). Check the draft in Vercel before anyone publishes it.`,
      };
    }
  }

  try {
    for (const change of changes) {
      log(`stage ${change.action} ${change.value?.name ?? change.id ?? ""}`.trim());
      const after = await client.stage(change);
      staged.push(change);
      settings ??= settingsOf(after);
    }
    const { draft: checked } = await client.configs();
    const problems = [...foreignChanges(checked, staged, settings), ...configProblems(checked, desired, active)];
    if (problems.length) throw new Error(`The draft doesn't match: ${problems.join("; ")}.`);
  } catch (err) {
    throw new Error(`${err.message} ${(await cleanUp()).note}`, { cause: err });
  }

  if (!publish) {
    const { cleared, note } = await cleanUp();
    if (!cleared) throw new Error(note);
    log(`The draft passed its checks with this run's ${changes.length} changes. ${note}`);
    return changes;
  }

  try {
    await client.publish();
  } catch (err) {
    // The publish can take effect even when its response fails.
    const live = await client.configs().then((c) => c.active, () => null);
    if (live && configProblems(live, desired, active).length === 0) {
      log(`Vercel answered the publish with an error (${err.message}), but the rules went live.`);
      return changes;
    }
    throw new Error(`${err.message} ${(await cleanUp()).note}`, { cause: err });
  }
  const after = await client.configs();
  if (after.draft) log(`Vercel kept a draft after publishing, with ${after.draft.changes?.length ?? 0} recorded changes.`);
  const problems = configProblems(after.active, desired, active);
  if (problems.length) throw new Error(`The live configuration doesn't match: ${problems.join("; ")}.`);
  log(`Published ${changes.length} changes.`);
  return changes;
}

const COMMANDS = ["routes", "check", "dry-run", "apply"];

async function main(command) {
  if (!COMMANDS.includes(command)) throw new Error("Use routes, check, dry-run or apply.");
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
    for (const line of bypassesAhead(active?.rules ?? [])) console.warn(`warning: ${line}`);
    for (const problem of problems) console.error(problem);
    if (problems.length) process.exit(1);
    console.log("The live firewall matches RULES.");
  } else {
    await applyRules({ client, publish: command === "apply" });
  }
}

if (process.argv[1]?.endsWith("firewall.mjs")) await main(process.argv[2]);
