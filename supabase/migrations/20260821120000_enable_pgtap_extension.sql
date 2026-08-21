-- pgTAP — assertion functions consumed by `supabase test db` (supabase/tests/).
-- Inert in production: a library of functions, nothing here runs on its own.
--
-- `extensions` is pre-created on every real Supabase project, but the migration shouldn't rely
-- on that going undocumented — create it defensively so this also applies cleanly to a plain
-- Postgres instance (verified locally against Postgres 16 without the Supabase stack).
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
