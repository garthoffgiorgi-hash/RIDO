-- The one canonical place year_month gets computed (root CLAUDE.md invariant 9: "fixed once,
-- documented, never re-derived per call site"). Every other function or query that needs a
-- year_month bucket calls this rather than reimplementing the timezone conversion.

create or replace function public.rido_year_month(p_ts timestamptz)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select to_char(p_ts at time zone 'America/Los_Angeles', 'YYYY-MM');
$$;

comment on function public.rido_year_month(timestamptz) is
  'Canonical year_month bucketing (America/Los_Angeles), per root CLAUDE.md invariant 9. '
  'The only place this conversion happens — never re-derive it elsewhere.';
