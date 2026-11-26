// Runs schema.sql in PGlite (in-process Postgres) with a stub of Supabase's auth schema and roles,
// then proves the RLS and role-protection rules. Run: npm install && node test-schema.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
await db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
await db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8")); // idempotent: second run must not fail

let bad = 0;
const check = (name, ok, extra = "") => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`); };
const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b";
await db.exec(`insert into auth.users (id, email) values ('${A}','alice@example.com'), ('${B}','bob@example.com')`);

const rows = (await db.query("select id, role from public.profiles order by email")).rows;
check("signup trigger created 2 profiles with role 'user'", rows.length === 2 && rows.every((r) => r.role === "user"));

// Act as an API caller: set role and the JWT subject claim (what PostgREST does per request).
const as = async (role, sub, sql) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${sub ?? ""}', false);`);
  try { return await db.query(sql); } catch (e) { return { error: e.message, rows: [] }; }
  finally { await db.exec("reset role"); }
};

let r = await as("authenticated", A, "select email from public.profiles");
check("user A reads only their own row", r.rows.length === 1 && r.rows[0].email === "alice@example.com", JSON.stringify(r.rows));
r = await as("authenticated", A, `select * from public.profiles where id = '${B}'`);
check("user A cannot read user B's row", r.rows.length === 0);
r = await as("anon", null, "select * from public.profiles");
check("anon cannot read profiles", !!r.error, r.error);
r = await as("authenticated", A, `update public.profiles set role = 'super_admin' where id = '${A}'`);
check("user A cannot update own role (column privilege)", !!r.error, r.error);
r = await as("authenticated", A, `update public.profiles set display_name = 'Al' where id = '${A}'`);
check("user A can update own display_name", r.affectedRows === 1 && !r.error, `affected ${r.affectedRows}`);
r = await as("authenticated", A, `update public.profiles set display_name = 'Hacked' where id = '${B}'`);
check("user A cannot update B's row", r.affectedRows === 0);
r = await as("authenticated", A, `insert into public.profiles (id, role) values (gen_random_uuid(), 'super_admin')`);
check("user A cannot insert profiles", !!r.error, r.error);
r = await as("authenticated", A, `delete from public.profiles where id = '${A}'`);
check("user A cannot delete profiles", !!r.error, r.error);

// Trigger layer alone: grant update(role) wrongly, the trigger must still block it.
await db.exec("grant update (role) on public.profiles to authenticated");
r = await as("authenticated", A, `update public.profiles set role = 'super_admin' where id = '${A}'`);
check("trigger blocks role change even if update(role) were granted", /role cannot be changed/.test(r.error ?? ""), r.error);
await db.exec("revoke update (role) on public.profiles from authenticated");

// Manual promotion in the SQL editor (postgres role) works and is then readable by the user.
await db.exec("update public.profiles set role = 'super_admin' where email = 'alice@example.com'");
r = await as("authenticated", A, "select role from public.profiles");
check("manual SQL-editor promotion works; A now reads role super_admin", r.rows[0]?.role === "super_admin");
r = await as("authenticated", B, "select role from public.profiles");
check("user B still 'user'", r.rows.length === 1 && r.rows[0].role === "user");

process.exit(bad ? 1 : 0);
