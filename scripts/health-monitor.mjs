// The outside check on hivesight.ai, run by .github/workflows/health-monitor.yml.
// Production refuses every estimate when the database can't answer, and nothing
// on Vercel can report that. Each open GitHub issue labeled health-alert stands
// for one problem, so a second run finds it and raises no second alert.
// ~/chief-of-staff/bin/hivesight-health-watch sends Max each new issue on Telegram.
// This file runs with plain Node on the runner, so it imports nothing.

export const LIVE_URL = "https://hivesight.ai/api/health";
export const DRILL_URL =
  "https://raw.githubusercontent.com/HiveSight/hivesight/main/scripts/health-drill.json";

export const LABEL = "health-alert";
export const BOT = "github-actions[bot]";
const ASSIGNEE = "MaxGhenis";

const ATTEMPTS = 3;
// /api/health reuses a store ping for 30 seconds, so a retry must wait longer.
const RETRY_MS = 40_000;
const REQUEST_TIMEOUT_MS = 20_000;
const STALE_ANSWER_MS = 10 * 60_000;
// A problem that clears and returns inside this window stays the same incident.
// Each new issue pages Max, so a site must pass for an hour to count as recovered.
export const QUIET_MS = 60 * 60_000;

export const CONDITIONS = {
  outage: {
    title: "hivesight.ai health check failing: estimates may be down",
    advice: [
      "Check the Supabase project `nbtaqmnxvwftbooxjhnd`: it may be paused, or its organization may be over quota (requests then return HTTP 402).",
      "Read the production logs: `vercel logs --project hivesight --no-branch --environment production --since 1h --scope max-ghenis-projects`.",
    ],
  },
  "database-size": {
    title: "HiveSight database is nearing the free plan's 500 MB",
    advice: [
      "Check that `/api/cron/keepalive` still purges old records, and how much the other projects in the organization hold: Supabase counts them all.",
    ],
  },
  drill: {
    title: "[drill] hivesight.ai health alert test: no action needed",
    advice: ["This tests the alert path against scripts/health-drill.json. hivesight.ai is unaffected."],
  },
};

// Health messages reach a public issue and Telegram, so keep only plain text.
const clean = (text) =>
  String(text)
    .replace(/[^\w .,:;%()/'-]/g, " ")
    .trim()
    .slice(0, 200);

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

function checksOf(answer) {
  if (!isRecord(answer.body) || !Array.isArray(answer.body.checks)) return null;
  return answer.body.checks.filter(isRecord);
}

/** What stops the site serving estimates. Anything but a clear pass is a problem. */
export function outageProblems(answer, now) {
  if (answer.error) return [`health endpoint unreachable: ${clean(answer.error)}`];
  const checks = checksOf(answer);
  if (!checks) return [`health endpoint answered HTTP ${answer.status} with no checks`];
  const problems = checks
    .filter((check) => check.status === "failed")
    .map((check) => `${clean(check.name)}: ${clean(check.message)}`);
  if (problems.length > 0) return problems;
  const store = checks.find((check) => check.name === "store");
  if (!store) return ["health endpoint reported no store check"];
  if (store.status !== "ok") return [`store: ${clean(store.status)}`];
  if (answer.status !== 200 || answer.body.status !== "ok") {
    return [`health endpoint answered HTTP ${answer.status}, status ${clean(answer.body.status)}`];
  }
  const age = now - Date.parse(answer.body.checkedAt);
  // A cached answer would hide an outage behind an old pass.
  if (!(age < STALE_ANSWER_MS)) return [`health answer is stale: ${clean(answer.body.checkedAt)}`];
  return [];
}

/** Null when this run learned nothing about the size, so its issue stays as it is. */
export function sizeProblems(answer) {
  const check = checksOf(answer)?.find((c) => c.name === "database_size");
  if (!check || (check.status !== "ok" && check.status !== "warning")) return null;
  return check.status === "warning" ? [`database_size: ${clean(check.message)}`] : [];
}

/**
 * The one choice each run makes for each condition. Only "open" alerts anyone:
 * GitHub notifies nobody of a body edit, so "update" stays silent.
 */
export function decide({ open, problems, now, quietMs = QUIET_MS }) {
  if (problems.length > 0) return open ? "update" : "open";
  if (open && now - Date.parse(open.lastFailedAt) >= quietMs) return "close";
  return "none";
}

const MARKER = /<!-- health-monitor (\{.*\}) -->/;

export function parseState(body) {
  const match = MARKER.exec(body ?? "");
  if (!match) return null;
  try {
    const state = JSON.parse(match[1]);
    return isRecord(state) && Object.hasOwn(CONDITIONS, state.condition) ? state : null;
  } catch {
    return null;
  }
}

export function renderBody(state, runUrl) {
  const { title, advice } = CONDITIONS[state.condition];
  return [
    `**${title}**`,
    "",
    ...state.problems.map((problem) => `- ${problem}`),
    "",
    `First failed: ${state.startedAt}`,
    `Last failed: ${state.lastFailedAt}`,
    `Failed runs: ${state.failedRuns}`,
    `Latest run: ${runUrl}`,
    "",
    ...advice.map((line) => `- ${line}`),
    "",
    `This issue closes itself after ${QUIET_MS / 60_000} minutes without a failure.`,
    "",
    `<!-- health-monitor ${JSON.stringify(state)} -->`,
  ].join("\n");
}

/** Reads the endpoint, retrying a failure, and returns the last answer. */
export async function probe(url, { attempts = ATTEMPTS, retryMs = RETRY_MS, fetchFn = fetch } = {}) {
  let answer;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    answer = await read(url, fetchFn);
    if (outageProblems(answer, Date.now()).length === 0) return answer;
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, retryMs));
  }
  return answer;
}

async function read(url, fetchFn) {
  try {
    const response = await fetchFn(url, {
      headers: { "user-agent": "hivesight-health-monitor" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    try {
      return { status: response.status, body: JSON.parse(text) };
    } catch {
      return { status: response.status, body: null };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export function githubClient({ token, repo, fetchFn = fetch }) {
  async function call(method, path, body) {
    const response = await fetchFn(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "user-agent": "hivesight-health-monitor",
        "x-github-api-version": "2022-11-28",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`GitHub ${method} ${path}: HTTP ${response.status}`);
    return response.json();
  }
  return {
    async openIssues() {
      const issues = await call("GET", `/issues?state=open&labels=${LABEL}&per_page=100`);
      // Only this workflow's issues count: anyone can open one on a public repo.
      return issues
        .filter((issue) => issue.user?.login === BOT && !issue.pull_request)
        .map((issue) => ({ number: issue.number, state: parseState(issue.body) }))
        .filter((issue) => issue.state)
        .sort((a, b) => a.number - b.number);
    },
    create: (title, body) =>
      call("POST", "/issues", { title, body, labels: [LABEL], assignees: [ASSIGNEE] }),
    update: (number, body) => call("PATCH", `/issues/${number}`, { body }),
    // Closes first: a run that dies between the two calls can't comment twice.
    async close(number, comment) {
      await call("PATCH", `/issues/${number}`, { state: "closed", state_reason: "completed" });
      await call("POST", `/issues/${number}/comments`, { body: comment });
    },
  };
}

/** Applies one run's observations and returns what it did, for the run's log. */
export async function apply({ observed, issues, github, now, runUrl }) {
  const at = new Date(now).toISOString();
  const done = {};
  for (const [condition, problems] of Object.entries(observed)) {
    if (problems === null) continue;
    const mine = issues.filter((issue) => issue.state.condition === condition);
    const open = mine[0]?.state;
    const action = decide({ open, problems, now });
    done[condition] = action;
    if (action === "open") {
      const state = { condition, startedAt: at, lastFailedAt: at, failedRuns: 1, problems };
      await github.create(CONDITIONS[condition].title, renderBody(state, runUrl));
    } else if (action === "update") {
      const state = { ...open, lastFailedAt: at, failedRuns: open.failedRuns + 1, problems };
      await github.update(mine[0].number, renderBody(state, runUrl));
    } else if (action === "close") {
      for (const issue of mine) {
        await github.close(issue.number, `Passing again. Last failure: ${open.lastFailedAt}.`);
      }
    }
  }
  return done;
}

async function main() {
  const { GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_SERVER_URL, GITHUB_RUN_ID, HEALTH_DRILL } = process.env;
  const drill = HEALTH_DRILL === "true";
  const answer = await probe(drill ? DRILL_URL : LIVE_URL);
  const now = Date.now();
  const problems = outageProblems(answer, now);
  const observed = drill
    ? { drill: problems }
    : { outage: problems, "database-size": sizeProblems(answer), drill: [] };
  const github = githubClient({ token: GITHUB_TOKEN, repo: GITHUB_REPOSITORY });
  const done = await apply({
    observed,
    issues: await github.openIssues(),
    github,
    now,
    runUrl: `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`,
  });
  console.log(JSON.stringify({ problems, done }));
}

if (process.argv[1]?.endsWith("health-monitor.mjs")) await main();
