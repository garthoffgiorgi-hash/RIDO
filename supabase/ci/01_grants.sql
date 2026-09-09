-- CI-only scaffolding. Never applied to the real Supabase project, never a migration.
--
-- Applied AFTER migrations, not before: pgTAP's own migration
-- (20260821120000_enable_pgtap_extension.sql) is what creates the `extensions` schema in the
-- first place, so granting into it earlier would fail with "schema does not exist".
--
-- pgTAP's assertion functions (plan(), is(), throws_ok(), finish(), ...) live in `extensions`
-- and every test file calls them unqualified — including from inside a
-- `set local role authenticated` block, since a test proves what a real signed-in session can
-- and cannot do. Both the schema path and the execute privilege have to reach that role, or a
-- test fails on "function plan(integer) does not exist" while impersonating a user rather than
-- on the property it's actually checking.
grant usage on schema extensions to public;
grant execute on all functions in schema extensions to public;
alter database rido_ci set search_path to public, extensions;
