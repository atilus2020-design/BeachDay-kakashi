# Supabase Auth — notes from the official docs

All pages read on **2026-11-26** (via Firecrawl, because the container cannot reach supabase.com directly). Quoted sentences are as returned for each page. Where a page did not confirm something, it says **NOT CONFIRMED**.

## 1. Password-based auth (sign up, sign in, reset)
Source: https://supabase.com/docs/guides/auth/passwords
- "Email authentication is enabled by default." "You can configure whether users need to verify their email to sign in. On hosted Supabase projects, this is true by default."
- Sign up: "call `signUp()` with their email address and password." The optional redirect URL "must be configured as a Redirect URL". "If you don't specify a redirect URL, the user is automatically redirected to your site URL. This defaults to `localhost:3000`".
```js
const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: 'https://example.com/welcome' } })
const { data, error } = await supabase.auth.signInWithPassword({ email, password })
```
- Reset: "To prevent user enumeration, `resetPasswordForEmail()` doesn't reveal whether an account exists for the given email address." "When no user is associated with the address, Supabase Auth won't send an email, though the method still returns without an error."
```js
await supabase.auth.resetPasswordForEmail('valid.email@supabase.io', { redirectTo: 'http://example.com/account/update-password' })
await supabase.auth.updateUser({ password: 'new_password' })   // on the redirect page
```
- Minimum password length/strength settings: **NOT CONFIRMED** on this page (set them in the dashboard; check before shipping).

## 2. supabase-js auth reference
Source: https://supabase.com/docs/reference/javascript/auth-signup (and sibling pages `auth-signinwithpassword`, `auth-signout`, `auth-resetpasswordforemail`, `auth-updateuser`)
- `signUp`: "If **Confirm email** is enabled, a `user` is returned but `session` is null."
- `signInWithPassword`: "Requires either an email and password or a phone number and password."
- `signOut`: "In order to use the `signOut()` method, the user needs to be signed in first." → `const { error } = await supabase.auth.signOut()`
- `resetPasswordForEmail`: "When the user clicks the reset link in the email they are redirected back to your application. You can configure the URL that the user is redirected to with the `redirectTo` parameter." "A `PASSWORD_RECOVERY` event will be emitted when the password recovery link is clicked."
- `updateUser`: "In order to use the `updateUser()` method, the user needs to be signed in first." "After the user has been redirected successfully, prompt them for a new password and call `updateUser()`": `supabase.auth.updateUser({ password: new_password })`

### signInWithOAuth
Source: https://supabase.com/docs/reference/javascript/auth-signinwithoauth
- "Log in an existing user via a third-party provider. This method supports the PKCE flow." "It works by redirecting your application to the provider's authorization screen, before bringing back the user to your app."
- Parameter details (`options.redirectTo`, `scopes`, `queryParams`): the reference page did not return them; `redirectTo` is confirmed by the Google guide (section 4).

### getUser (server-side verification)
Source: https://supabase.com/docs/reference/javascript/auth-getuser
- "This method performs a network request to the Supabase Auth server, so the returned value is authentic and can be used to base authorization rules on."
- "Should always be used when checking for user authorization on the server. On the client, you can instead use `getSession().session.user` for faster results. `getSession` is insecure on the server."
- `jwt` parameter: "Takes in an optional access token JWT. If no JWT is provided, the JWT from the current session is used." → `supabase.auth.getUser(token)`

### getClaims
Source: https://supabase.com/docs/reference/javascript/auth-getclaims
- "If your project is using asymmetric JWT signing keys, then the verification is done locally usually without a network request using the WebCrypto API."
- "If the project is not using an asymmetric JWT signing key (like ECC or RSA) it always sends a request to the Auth server (similar to GoTrueClient.getUser) to verify the JWT."
- "Prefer this method over GoTrueClient.getUser which always sends a request to the Auth server for each JWT." Signature `getClaims(jwt?, options)`; example `const { data, error } = await supabase.auth.getClaims()`.
- Beach Day choice: **`getUser(token)` / `GET /auth/v1/user`** — one documented, always-authoritative call that also detects revoked sessions. `getClaims` is the faster alternative if latency matters and the project uses asymmetric signing keys (decision for the architect).

### onAuthStateChange
Source: https://supabase.com/docs/reference/javascript/auth-onauthstatechange
- Events: `INITIAL_SESSION`, `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`, `USER_UPDATED`, `PASSWORD_RECOVERY`.
- `PASSWORD_RECOVERY`: "Emitted instead of the `SIGNED_IN` event when the user lands on a page that includes a password recovery link in the URL. Use it to show a UI to the user where they can reset their password."
- `TOKEN_REFRESHED`: "It's best practice and highly recommended to extract the access token (JWT) and store it in memory for further use in your application. Avoid frequent calls to `supabase.auth.getSession()` for the same purpose."
- "Keep callbacks quick. Events are awaited in order, so a slow callback delays subsequent events to subscribers in this tab." `SIGNED_IN` "may occur even when the user is already signed in."
- Unsubscribe: `const { data } = supabase.auth.onAuthStateChange(cb); data.subscription.unsubscribe()`

## 3. JWTs and the server-side check
Source: https://supabase.com/docs/guides/auth/jwts
- "If your project is using a shared secret (HS256) signing key, we recommend always verifying a user access token directly with the Auth server by sending a request like so:"
```
GET https://project-id.supabase.co/auth/v1/user
apikey: publishable key
Authorization: Bearer <JWT>
```
"If the server responds with HTTP 200 OK, the JWT is valid, otherwise it is not." (This is the call `verify-token.mjs` makes, with no SDK.)
- Asymmetric keys: `GET https://project-id.supabase.co/auth/v1/.well-known/jwks.json`; the Edge caches it 10 minutes.
- The `role` claim is "The Postgres role to use when applying Row Level Security policies" (value `authenticated`) — it is **not** our app role. Our `super_admin` lives in `public.profiles`.
- `user_metadata` / `app_metadata` guidance: **NOT CONFIRMED** on this page. Rule we apply anyway: never authorize from anything the client can send or edit; read `profiles.role`.

## 4. Login with Google
Source: https://supabase.com/docs/guides/auth/social-login/auth-google
1. "Create a new OAuth client ID and choose **Web application** for the application type."
2. "Under **Authorized JavaScript origins** add your application's URL." (add `https://example.com`; "Add `http://localhost:<port>` while developing locally. Remember to remove this when your application goes into production".)
3. "Under **Authorized redirect URIs** add your Supabase project's callback URL." Copy it from the Google provider page in the dashboard; local dev: `http://127.0.0.1:54321/auth/v1/callback`. (It has the form `https://<project-ref>.supabase.co/auth/v1/callback`.)
4. "Click `Create` and make sure you save the Client ID and Client Secret. Add these values to the Google provider page on the Dashboard." The Google client secret lives only in the Supabase dashboard, never in Netlify or the repo.
```js
supabase.auth.signInWithOAuth({ provider: 'google' })
await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `http://example.com/auth/callback` } })
```

## 5. Redirect URLs (allow-list)
Source: https://supabase.com/docs/guides/auth/redirect-urls
- "The Site URL in URL Configuration defines the default redirect URL when no `redirectTo` is specified in the code. Change this from `http://localhost:3000` to your production URL... This setting is critical for email confirmations and password resets."
- Wildcards in the allow list: `*` any non-separator characters, `**` any characters, `?` one non-separator character.
- Netlify: "set the `SITE_URL` to your official site URL. Add the following additional redirect URLs for local development and deployment previews: `http://localhost:3000/**` and `https://**--my_org.netlify.app/**`".
- What happens to a `redirectTo` that is not on the list: **NOT CONFIRMED** in the text returned (the page says redirect URLs "must be configured"); test it on the real project.

## 6. Row Level Security
Source: https://supabase.com/docs/guides/database/postgres/row-level-security
- "Enable RLS on every table in an exposed schema." `alter table public.reports enable row level security;`
- "Once RLS is enabled, no data is accessible through the API when using a publishable key, until you create policies."
- Roles: `anon` = unauthenticated request; `authenticated` = signed-in. "A table protected only by policies still hands `anon` an insert path if you never revoke the grant."
- Policies, with `(select auth.uid())` ("Wrapping the function causes an `initPlan` to be run by the Postgres optimizer, which allows it to "cache" the results per-statement, rather than calling the function on each row."):
```sql
create policy "Users can view their own profile." on profiles for select to authenticated using ( (select auth.uid()) = user_id );
create policy "Users can update their own profile." on profiles for update to authenticated
  using ( (select auth.uid()) = user_id )        -- checks the existing row
  with check ( (select auth.uid()) = user_id );  -- checks the resulting row
```
(The guide's example column is `user_id`; our table uses `id` because it is the primary key referencing `auth.users`.)

## 7. Column-level privileges (stopping role changes)
Source: https://supabase.com/docs/guides/database/postgres/column-level-security
```sql
revoke update on table public.posts from authenticated;
grant update (title, content) on table public.posts to authenticated;
```
- Caveat: "If you have both, and you revoke the column-level privilege, the table-level privilege will still be in effect." So revoke the table-level grant first, then grant only safe columns. RLS policies cannot restrict which *columns* change; privileges do. The `protect_profile_role` trigger in `examples/schema.sql` is a second layer (our design, not from this page).

## 8. API keys
Source: https://supabase.com/docs/guides/getting-started/api-keys
- Publishable `sb_publishable_...`: "Safe to expose online: web page, mobile or desktop app, GitHub actions, CLIs, source code."
- Secret `sb_secret_...`: "Only use in backend components of your app... They provide full access to your project's data, bypassing Row Level Security." "Never put one in a browser, a shipped application, or source control."
- "Send publishable and secret keys on the `apikey` header, not on `Authorization: Bearer`. Because the keys aren't JWTs, anything that tries to verify one as a JWT fails." The user's access token goes in `Authorization: Bearer`.
- "Supabase is deprecating the `anon` and `service_role` keys in early 2027. Use the publishable and secret keys instead."
- **Beach Day rule:** only `SUPABASE_URL` and the publishable key exist in this project. No secret key anywhere, because the role is read under RLS with the caller's JWT.

## 9. Profiles table and signup trigger
Source: https://supabase.com/docs/guides/auth/managing-user-data
- "For security, the Auth schema is not exposed in the auto-generated API." So app data goes in `public.profiles`:
```sql
create table public.profiles ( id uuid not null references auth.users on delete cascade, first_name text, last_name text, primary key (id) );
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
alter table public.profiles enable row level security;
create function public.handle_new_user() returns trigger language plpgsql
security definer set search_path = '' as $$
begin insert into public.profiles (id, first_name, last_name)
  values (new.id, new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data ->> 'last_name'); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
```
- Beach Day differs on purpose: no `anon` grant, `authenticated` gets select plus update on `display_name` only, and a `role` column defaulting to `'user'`.
