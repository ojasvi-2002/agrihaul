-- ============================================================
-- AgriHaul Supabase schema
-- Run once in Supabase → SQL Editor → New query → Run.
-- Creates the `profiles` table that stores each user's role,
-- auto-populates it on signup, and locks it down with RLS.
-- ============================================================

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text,
  role       text not null default 'viewer'
             check (role in ('viewer', 'dispatcher', 'admin', 'super_admin')),
  client_name text,
  created_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (email);

alter table public.profiles enable row level security;

-- A signed-in user may always read their own row — this is what lets
-- both the browser (auth.js → loadSession) and Code.gs (verifyCaller,
-- using the caller's own access token) confirm "who is this and what
-- is their role" without needing the service_role key for every check.
create policy "read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Deliberately NO client-side update/delete policy on this table.
-- Role changes and removals only ever happen through Code.gs using
-- the service_role key (which bypasses RLS), after Code.gs has
-- already verified the caller is a super_admin. This means even a
-- compromised anon key + a malicious "UPDATE profiles SET role=..."
-- request from a browser is rejected by Postgres itself.

-- Auto-create a profile row (defaulted to 'viewer') the moment a new
-- auth.users row is created — i.e. right after someone signs up (or
-- is invited) and verifies/accepts.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- BOOTSTRAP: there is no super_admin until you make one.
-- 1. Sign up through the app UI with your own email.
-- 2. Verify your email (click the link Supabase sends).
-- 3. Come back here and run, with YOUR email:
--
--   update public.profiles set role = 'super_admin' where email = 'you@yourcompany.com';
--
-- From then on, promote/invite/remove everyone else from the app's
-- "Users" page — you shouldn't need this SQL editor again.
-- ============================================================
