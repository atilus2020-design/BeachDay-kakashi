-- Beach Day: profiles + role, signup trigger, RLS. Re-runnable twin of
-- supabase/migrations/20261126000000_profiles.sql (same rules; adds "if not exists"/"drop ... if exists").
-- Rules (docs/security.md R4, D-007): RLS on, ONE select-own policy, revoke all then grant select only,
-- NO insert/update/delete grants or policies, so no API caller can ever change a role.

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  role       text not null default 'user' check (role in ('user', 'super_admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;          -- read only; RLS limits it to the caller's row

drop policy if exists "profiles: read own row" on public.profiles;
create policy "profiles: read own row"
  on public.profiles for select
  to authenticated
  using ( (select auth.uid()) = id );
-- No insert, update or delete policy and no such grant: only the trigger below creates rows.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);  -- role gets its default, 'user'
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Make someone super_admin: run MANUALLY in the SQL editor (never from the app):
--   update public.profiles set role = 'super_admin' where email = '<owner email>';
