-- Beach Day: profiles with an app role (user | super_admin).
-- Contract: docs/build-plan.md §3.6, docs/security.md R4, decisions D-007 and D-008.
-- Applied by the project owner (Supabase SQL editor or `supabase db push`). Reviewed by security-engineer.
--
-- What it guarantees:
--   * RLS is on; the only policy lets a signed-in user SELECT their own row.
--   * anon has no privileges; authenticated has SELECT only. There are no INSERT, UPDATE or DELETE
--     grants or policies, so nobody can change any role through the API, their own included.
--   * The profile row is created by a security-definer trigger on auth.users with (id, email) only.
--     The role always starts as the column default 'user'; nothing is copied from raw_user_meta_data.

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  role       text not null default 'user' check (role in ('user', 'super_admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- New tables in "public" start with every privilege granted to anon and authenticated, so revoke them all
-- and grant back only what is needed: read, for signed-in users (RLS limits it to their own row).
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

create policy "profiles: read own row"
  on public.profiles
  for select
  to authenticated
  using ( (select auth.uid()) = id );

-- No insert, update or delete policy, on purpose (D-007).

-- Create the profile when a user signs up (email + password or Google).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);  -- role gets its default, 'user'
  return new;
end;
$$;

-- The trigger function is only meant to run from the trigger; API roles must not call it directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------------------------
-- Promote the owner to super_admin: run MANUALLY in the Supabase SQL editor, never from the app.
-- No endpoint, UI or agent can do this. Promote by id, and only an account whose email is confirmed
-- (profiles.email is a copy taken at signup; auth.users is the source of truth):
--
--   update public.profiles p set role = 'super_admin'
--   from auth.users u
--   where p.id = u.id and u.email = '<owner email>' and u.email_confirmed_at is not null;
--
-- Check it changed exactly one row ("UPDATE 1"). Short form from build-plan §3.6, only if the email is confirmed:
--   update public.profiles set role = 'super_admin' where email = '<owner email>';
--
-- Revoke access again:
--
--   update public.profiles set role = 'user' where email = '<email>';
-- ---------------------------------------------------------------------------------------------
