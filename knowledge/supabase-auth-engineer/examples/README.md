# Examples — Supabase Auth engineer

Run on 2026-11-26 with Node v22.23.5. Setup once: `cd knowledge/supabase-auth-engineer/examples && npm install` (installs `@electric-sql/pglite`; `node_modules/` is gitignored).

| File | What it shows | How verified |
|---|---|---|
| `schema.sql` | `profiles` table, signup trigger, RLS select-own, role-change protection (column privilege + trigger) | executed in PGlite by `test-schema.mjs` (12 checks), run twice to prove it is re-runnable |
| `test-schema.mjs` | In-process Postgres with a stub `auth` schema, `auth.uid()` and the `anon`/`authenticated` roles | run, all ok |
| `verify-token.mjs` | Function guard: Bearer token → `GET /auth/v1/user` (apikey = publishable key) → role from `/rest/v1/profiles` with the caller's JWT | run against a mock HTTP server, all ok |
| `browser-auth.js` | Client setup, sign up/in/out, forgot password, Google, `onAuthStateChange`, sending the Bearer token | `node --check` only (needs a browser and a project) |

Limits of the PGlite stub: it is plain Postgres, not Supabase. It proves the SQL (RLS, grants, triggers) behaves as written; it does not prove Supabase's own `auth.users` columns or PostgREST. Test the migration once on a real project before relying on it.

## Exact output

```
$ node test-schema.mjs
ok   signup trigger created 2 profiles with role 'user'
ok   user A reads only their own row — [{"email":"alice@example.com"}]
ok   user A cannot read user B's row
ok   anon cannot read profiles — permission denied for table profiles
ok   user A cannot update own role (column privilege) — permission denied for table profiles
ok   user A can update own display_name — affected 1
ok   user A cannot update B's row
ok   user A cannot insert profiles — permission denied for table profiles
ok   user A cannot delete profiles — permission denied for table profiles
ok   trigger blocks role change even if update(role) were granted — role cannot be changed
ok   manual SQL-editor promotion works; A now reads role super_admin
ok   user B still 'user'

$ node verify-token.mjs
ok   no token: 401
ok   not a bearer JWT: 401
ok   bad token: 401
ok   role user: 403
ok   role super_admin: 200 (admin@example.com, super_admin)
ok   auth service down: 502 (fails closed)
requests seen by mock:
  GET /auth/v1/user apikey=true
  GET /auth/v1/user apikey=true
  GET /rest/v1/profiles apikey=true
  GET /auth/v1/user apikey=true
  GET /rest/v1/profiles apikey=true

$ node --check browser-auth.js
syntax ok
```
