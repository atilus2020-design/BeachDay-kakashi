-- Beach Day: profiles + role, trigger on signup, RLS, role-change protection.
-- Run in the Supabase SQL editor (runs as postgres). Safe to re-run.

create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  email        text,
  display_name text,
  role         text not null default 'user' check (role in ('user', 'super_admin')),
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Privileges: Supabase grants new public tables to anon/authenticated by default, so state them explicitly.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;                -- signed-in users may read (RLS limits to own row)
grant update (display_name) on public.profiles to authenticated; -- column privilege: role is NOT updatable

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles
  for select to authenticated
  using ( (select auth.uid()) = id );

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
  for update to authenticated
  using ( (select auth.uid()) = id )
  with check ( (select auth.uid()) = id );
-- No insert or delete policy and no grant: only the trigger below creates rows.

-- Second layer: even if someone later grants update(role) by mistake, API roles cannot change it.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role and current_user in ('anon', 'authenticated') then
    raise exception 'role cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- Create the profile when a user signs up (email+password or Google). Role always starts as 'user'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Make someone super_admin: run MANUALLY in the SQL editor (never from the app):
--   update public.profiles set role = 'super_admin' where email = 'you@example.com';
