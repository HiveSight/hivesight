import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import fc from "fast-check";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// These tests run the real migrations. Supabase grants its public roles access
// to new tables and functions by default, so the setup does too: otherwise a
// migration that forgot to revoke them would still pass.
const SUPABASE_ROLES = `
  do $$
  begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
    end if;
  end;
  $$;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

const MIGRATIONS_DIR = path.resolve("supabase/migrations");
const migrations = readdirSync(MIGRATIONS_DIR)
  .sort()
  .map((file) => readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));

const TODAY = "(now() at time zone 'utc')::date";

interface Claim {
  visitor: string;
  cost: number;
}

/** The allowance rules with no database: what claim_run must do, one claim at a time. */
function referenceClaim(
  state: { site: number; visitors: Map<string, number> },
  claim: Claim,
  limits: { visitorLimit: number; siteLimit: number }
): string {
  if (state.site + claim.cost > limits.siteLimit) return "site";
  const used = state.visitors.get(claim.visitor) ?? 0;
  if (used >= limits.visitorLimit) return "visitor";
  state.visitors.set(claim.visitor, used + 1);
  state.site += claim.cost;
  return "ok";
}

describe("run quota migrations", { timeout: 60_000 }, () => {
  let db: PGlite;

  async function claim(visitor: string, visitorLimit: number, cost: number, siteLimit: number) {
    await db.exec("set role service_role");
    const { rows } = await db.query<{ result: string }>(
      "select public.claim_run($1, $2, $3, $4) as result",
      [visitor, visitorLimit, cost, siteLimit]
    );
    await db.exec("reset role");
    return rows[0].result;
  }

  async function counts() {
    const { rows } = await db.query<{ bucket: string; used: number }>(
      `select bucket, used from public.run_quota where day = ${TODAY}`
    );
    return new Map(rows.map((r) => [r.bucket, r.used]));
  }

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SUPABASE_ROLES);
    for (const sql of migrations) await db.exec(sql);
  });
  beforeEach(() => db.exec("delete from public.run_quota; delete from public.runs;"));
  afterAll(() => db.close());

  it("agrees with the reference rules on any sequence of claims", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 60 }),
        fc.array(
          fc.record({
            visitor: fc.constantFrom("a", "b", "c"),
            cost: fc.integer({ min: 1, max: 40 }),
          }),
          { maxLength: 30 }
        ),
        async (visitorLimit, siteLimit, claims) => {
          await db.exec("delete from public.run_quota");
          const state = { site: 0, visitors: new Map<string, number>() };
          for (const c of claims) {
            const expected = referenceClaim(state, c, { visitorLimit, siteLimit });
            expect(await claim(c.visitor, visitorLimit, c.cost, siteLimit)).toBe(expected);
          }
          const stored = await counts();
          expect(stored.get("site") ?? 0).toBe(state.site);
          expect(state.site).toBeLessThanOrEqual(siteLimit);
          for (const [visitor, used] of state.visitors) {
            expect(stored.get(`visitor:${visitor}`)).toBe(used);
            expect(used).toBeLessThanOrEqual(visitorLimit);
          }
        }
      ),
      { numRuns: 40 }
    );
  });

  it("leaves both counts alone when either allowance refuses", async () => {
    expect(await claim("a", 1, 1, 10)).toBe("ok");
    expect(await claim("a", 1, 1, 10)).toBe("visitor");
    expect(await claim("b", 1, 10, 10)).toBe("site");
    const stored = await counts();
    expect(stored.get("site")).toBe(1);
    expect(stored.get("visitor:a")).toBe(1);
    expect(stored.has("visitor:b")).toBe(false);
  });

  it("starts each UTC day with fresh allowances", async () => {
    await db.exec(`insert into public.run_quota (bucket, day, used) values
      ('site', ${TODAY} - 1, 500), ('visitor:a', ${TODAY} - 1, 20)`);
    expect(await claim("a", 20, 1, 500)).toBe("ok");
    const stored = await counts();
    expect(stored.get("site")).toBe(1);
    expect(stored.get("visitor:a")).toBe(1);
  });

  it("refuses limits below one instead of counting past them", async () => {
    await expect(claim("a", 0, 1, 10)).rejects.toThrow("must be positive");
    await db.exec("reset role");
    await expect(claim("a", 1, 0, 10)).rejects.toThrow("must be positive");
    await db.exec("reset role");
    await expect(claim("a", 1, 1, 0)).rejects.toThrow("must be positive");
    await db.exec("reset role");
    expect((await counts()).size).toBe(0);
  });

  it("gives public roles no access to allowances or saved estimates", async () => {
    await db.exec("insert into public.runs (payload) values ('{}')");
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      for (const sql of [
        "select public.claim_run('a', 1, 1, 1)",
        "select public.purge_old_records(1)",
        "select * from public.run_quota",
        "update public.run_quota set used = 0",
        "select * from public.runs",
        "insert into public.runs (payload) values ('{}')",
      ]) {
        await expect(db.query(sql), `${role}: ${sql}`).rejects.toThrow("permission denied");
      }
      await db.exec("reset role");
    }
  });

  it("purges visitor keys after a day and saved estimates beyond the newest", async () => {
    await db.exec(`
      insert into public.run_quota (bucket, day, used) values
        ('visitor:old', ${TODAY} - 2, 1),
        ('visitor:yesterday', ${TODAY} - 1, 1),
        ('visitor:today', ${TODAY}, 1);
      insert into public.runs (created_at, payload) values
        (now() - interval '3 days', '{"n": 3}'),
        (now() - interval '2 days', '{"n": 2}'),
        (now() - interval '1 day', '{"n": 1}');
    `);
    await db.exec("set role service_role");
    await db.query("select public.purge_old_records(2)");
    await db.exec("reset role");
    const buckets = await db.query<{ bucket: string }>(
      "select bucket from public.run_quota order by bucket"
    );
    expect(buckets.rows.map((r) => r.bucket)).toEqual(["visitor:today", "visitor:yesterday"]);
    const runs = await db.query<{ n: number }>(
      "select (payload->>'n')::int as n from public.runs order by n"
    );
    expect(runs.rows.map((r) => r.n)).toEqual([1, 2]);
  });
});

describe("legacy table lockdown", { timeout: 60_000 }, () => {
  it("closes public access to the old tables and keeps their rows", async () => {
    const db = new PGlite();
    await db.exec(SUPABASE_ROLES);
    await db.exec(`
      create table public.rate_limits (id serial primary key, ip_address text);
      create table public.surveys (id serial primary key, question text);
      insert into public.rate_limits (ip_address) values ('192.0.2.1');
      insert into public.surveys (question) values ('Old question');
      alter table public.surveys enable row level security;
      create policy "Anyone can view surveys by id" on public.surveys for select using (true);
      create function public.handle_new_user() returns trigger language plpgsql as
        $$ begin return new; end; $$;
    `);
    await db.exec("set role anon");
    expect((await db.query("select * from public.rate_limits")).rows).toHaveLength(1);
    expect((await db.query("select * from public.surveys")).rows).toHaveLength(1);
    await db.exec("reset role");

    await db.exec(migrations.find((sql) => sql.includes("legacy text"))!);

    for (const table of ["rate_limits", "surveys"]) {
      await db.exec("set role anon");
      await expect(db.query(`select * from public.${table}`)).rejects.toThrow("permission denied");
      await db.exec("reset role");
      expect((await db.query(`select * from public.${table}`)).rows).toHaveLength(1);
    }
    const rls = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where oid = 'public.rate_limits'::regclass"
    );
    expect(rls.rows[0].relrowsecurity).toBe(true);
    await db.close();
  });
});

// PGlite serves one connection, so racing claims needs a real server.
const databaseUrl = process.env.QUOTA_TEST_DATABASE_URL;

it("has a Postgres server for the concurrency tests in CI", () => {
  expect(!process.env.CI || Boolean(databaseUrl)).toBe(true);
});

describe.runIf(databaseUrl)("claim_run under concurrency", { timeout: 60_000 }, () => {
  let pool: pg.Pool;

  async function race(claims: Array<[string, number, number, number]>) {
    const results = await Promise.all(
      claims.map(async (args) => {
        const client = await pool.connect();
        try {
          await client.query("set role service_role");
          const { rows } = await client.query<{ result: string }>(
            "select public.claim_run($1, $2, $3, $4) as result",
            args
          );
          return rows[0].result;
        } finally {
          await client.query("reset role");
          client.release();
        }
      })
    );
    const { rows } = await pool.query<{ bucket: string; used: number }>(
      `select bucket, used from public.run_quota where day = ${TODAY}`
    );
    return { results, used: new Map(rows.map((r) => [r.bucket, r.used])) };
  }

  beforeAll(async () => {
    expect(databaseUrl, "the setup drops the public schema").toMatch(/test/);
    pool = new pg.Pool({ connectionString: databaseUrl, max: 20 });
    await pool.query("drop schema if exists public cascade; create schema public;");
    await pool.query(SUPABASE_ROLES);
    for (const sql of migrations) await pool.query(sql);
  });
  beforeEach(() => pool.query("delete from public.run_quota"));
  afterAll(() => pool.end());

  it("admits exactly the visitor's allowance", async () => {
    const claims = Array.from({ length: 120 }, (): [string, number, number, number] => [
      "same",
      7,
      1,
      1000,
    ]);
    const { results, used } = await race(claims);
    expect(results.filter((r) => r === "ok")).toHaveLength(7);
    expect(results.filter((r) => r === "visitor")).toHaveLength(113);
    expect(used.get("visitor:same")).toBe(7);
    expect(used.get("site")).toBe(7);
  });

  it("admits exactly the site's allowance across visitors", async () => {
    const claims = Array.from({ length: 120 }, (_, i): [string, number, number, number] => [
      `visitor-${i}`,
      20,
      7,
      50,
    ]);
    const { results, used } = await race(claims);
    expect(results.filter((r) => r === "ok")).toHaveLength(7);
    expect(results.filter((r) => r === "site")).toHaveLength(113);
    expect(used.get("site")).toBe(49);
  });

  it("keeps both counts true when both allowances run out together", async () => {
    const claims = Array.from({ length: 200 }, (_, i): [string, number, number, number] => [
      `visitor-${i % 5}`,
      4,
      1 + (i % 3),
      30,
    ]);
    const { results, used } = await race(claims);
    const site = used.get("site") ?? 0;
    expect(site).toBeLessThanOrEqual(30);
    expect(site).toBe(
      claims.reduce((sum, c, i) => sum + (results[i] === "ok" ? c[2] : 0), 0)
    );
    let visitorTotal = 0;
    for (let v = 0; v < 5; v++) {
      const count = used.get(`visitor:visitor-${v}`) ?? 0;
      expect(count).toBeLessThanOrEqual(4);
      visitorTotal += count;
    }
    expect(visitorTotal).toBe(results.filter((r) => r === "ok").length);
  });
});
