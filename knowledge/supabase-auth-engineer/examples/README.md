# Examples — Supabase Auth engineer

Run on 2026-11-26 with Node v22.23.5. Setup once: `cd knowledge/supabase-auth-engineer/examples && npm install` (installs `@electric-sql/pglite`; `node_modules/` is gitignored).

| File | What it shows | How verified |
|---|---|---|
| `schema.sql` | Re-runnable twin of `supabase/migrations/20261126000000_profiles.sql`: `profiles`, signup trigger `(id, email)` only, RLS with ONE select-own policy, SELECT-only grant, no write grants/policies | executed in PGlite by `test-schema.mjs`, run twice to prove it is re-runnable |
| `test-schema.mjs` | In-process Postgres with a stub `auth` schema, `auth.uid()`, the `anon`/`authenticated`/`supabase_auth_admin` roles; also applies the real migration file to a fresh db | run, 19 checks ok |
| `verify-token.mjs` | Minimal raw-HTTP sketch of the guard (no SDK, no CSRF): `GET /auth/v1/user` → `/rest/v1/profiles?select=id,role&id=eq.<id>` with the caller's JWT. The production guard is `netlify/functions/_lib/auth.ts` | run against a mock HTTP server, all ok |
| `browser-auth.js` | Client setup (PKCE), sign up/in/out, forgot password, Google, `onAuthStateChange`, sending the Bearer token. Production module: `src/lib/auth.ts` | `node --check` only (needs a browser and a project) |

Limits of the PGlite stub: it is plain Postgres, not Supabase. It proves the SQL (RLS, grants, triggers) behaves as written; it does not prove Supabase's own `auth.users` columns or PostgREST. Test the migration once on a real project before relying on it.

## Exact output

```
$ node test-schema.mjs
ok   signup trigger created 2 profiles with role 'user'
ok   user A reads only their own row — [{"email":"alice@example.com"}]
ok   user A cannot read user B's row
ok   anon cannot read profiles — permission denied for table profiles
ok   user A cannot update own role (no update grant) — permission denied for table profiles
ok   user A cannot update any column of own row — permission denied for table profiles
ok   user A cannot insert profiles — permission denied for table profiles
ok   user A cannot delete profiles — permission denied for table profiles
ok   anon cannot update profiles — permission denied for table profiles
ok   API role cannot call handle_new_user() directly — permission denied for function handle_new_user
ok   exactly one policy, SELECT — [{"polname":"profiles: read own row","polcmd":"r"}]
ok   grants: authenticated SELECT only, anon none — [{"grantee":"authenticated","privilege_type":"SELECT"}]
ok   no column-level write grants — count 0
ok   signup by supabase_auth_admin creates row; metadata role ignored — [{"role":"user"}]
ok   promotion SQL skips an unconfirmed account — affected 0
ok   promotion SQL updates exactly one confirmed account — affected 1
ok   manual SQL-editor promotion works; A now reads role super_admin
ok   user B still 'user'
ok   migration file applies to a fresh db; 1 SELECT policy; SELECT-only grant — [{"grantee":"authenticated","privilege_type":"SELECT"}]

$ node verify-token.mjs
ok   no token: 401
ok   not a bearer JWT: 401
ok   bad token: 401
ok   role user: 403
ok   role super_admin: 200 (admin@example.com, super_admin)
ok   auth service down: 503 (fails closed)

$ node --check browser-auth.js
syntax ok
```
