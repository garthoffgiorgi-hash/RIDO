-- CI-only scaffolding. Never applied to the real Supabase project, never a migration.
--
-- WHY THIS EXISTS. supabase/migrations/*.sql assumes three things a real Supabase project
-- provides and a bare Postgres does not: the anon/authenticated/service_role roles, an
-- auth.users table (every table in this schema references it), and auth.uid() (every RLS
-- policy calls it). CI has no Supabase project to run migrations against — standing one up is
-- out of proportion to what this buys — so this file is the minimal stand-in for exactly those
-- three things, applied before any migration.
--
-- Kept intentionally tiny: this must not grow into a second opinion about what auth.users looks
-- like. `id uuid primary key` is the only column any migration or test in this repo reads off
-- that table directly (a foreign key target and RLS join key, nothing more).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;

create schema auth;
create table auth.users (
  id uuid primary key
);
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;

-- The real Supabase reads the JWT's `sub` claim off the request. pgTAP tests impersonate a user
-- with `set local request.jwt.claim.sub = '<uuid>'` before `set local role authenticated` — this
-- is what every RLS policy's `auth.uid()` call resolves against in that same session.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
