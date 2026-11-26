// Runs schema.sql in PGlite (in-process Postgres) with a stub of Supabase's auth schema and roles,
// then proves the RLS and role-protection rules. Run: npm install && node test-schema.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role supabase_auth_admin nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema auth to supabase_auth_admin; grant insert on auth.users to supabase_auth_admin;
`);
await db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
await db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8")); // idempotent: second run must not fail

let bad = 0;
const check = (name, ok, extra = "") => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`); };
const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b", C = "00000000-0000-0000-0000-00000000000c";
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
check("user A cannot update own role (no update grant)", /permission denied/.test(r.error ?? ""), r.error);
r = await as("authenticated", A, `update public.profiles set email = 'x@example.com' where id = '${A}'`);
check("user A cannot update any column of own row", /permission denied/.test(r.error ?? ""), r.error);
r = await as("authenticated", A, `insert into public.profiles (id, role) values (gen_random_uuid(), 'super_admin')`);
check("user A cannot insert profiles", /permission denied/.test(r.error ?? ""), r.error);
r = await as("authenticated", A, `delete from public.profiles where id = '${A}'`);
check("user A cannot delete profiles", /permission denied/.test(r.error ?? ""), r.error);
r = await as("anon", null, `update public.profiles set role = 'super_admin'`);
check("anon cannot update profiles", /permission denied/.test(r.error ?? ""), r.error);
r = await as("authenticated", A, `select public.handle_new_user()`);
check("API role cannot call handle_new_user() directly", /permission denied/.test(r.error ?? ""), r.error);

// Exactly the policies and grants the contract allows.
const pol = (await db.query(`select polname, polcmd from pg_policy where polrelid = 'public.profiles'::regclass`)).rows;
check("exactly one policy, SELECT", pol.length === 1 && pol[0].polcmd === "r", JSON.stringify(pol));
const grants = (await db.query(`select grantee, privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'profiles' and grantee in ('anon','authenticated') order by 1, 2`)).rows;
check("grants: authenticated SELECT only, anon none", grants.length === 1 && grants[0].grantee === "authenticated" && grants[0].privilege_type === "SELECT", JSON.stringify(grants));
const colGrants = (await db.query(`select count(*)::int n from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'profiles' and grantee in ('anon','authenticated') and privilege_type <> 'SELECT'`)).rows[0].n;
check("no column-level write grants", colGrants === 0, `count ${colGrants}`);

// Signup as Supabase's auth service role (not superuser): the security-definer trigger still creates the row,
// with role 'user' even if the sign-up metadata claims otherwise.
await db.exec(`set role supabase_auth_admin; insert into auth.users (id, email, raw_user_meta_data)
  values ('${C}', 'carol@example.com', '{"role":"super_admin"}'); reset role;`);
r = await db.query(`select role from public.profiles where id = '${C}'`);
check("signup by supabase_auth_admin creates row; metadata role ignored", r.rows[0]?.role === "user", JSON.stringify(r.rows));

// Manual promotion in the SQL editor (postgres role) works and is then readable by the user.
await db.exec("update public.profiles set role = 'super_admin' where email = 'alice@example.com'");
r = await as("authenticated", A, "select role from public.profiles");
check("manual SQL-editor promotion works; A now reads role super_admin", r.rows[0]?.role === "super_admin");
r = await as("authenticated", B, "select role from public.profiles");
check("user B still 'user'", r.rows.length === 1 && r.rows[0].role === "user");

process.exit(bad ? 1 : 0);
