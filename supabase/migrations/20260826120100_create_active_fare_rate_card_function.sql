-- active_fare_rate_card — the card in force for a market right now.
--
-- Exists for the same reason active_commission_tiers() does: `effective_from <= today` needs a
-- definition of today, and RIDO's day boundary is America/Los_Angeles, not UTC (root CLAUDE.md
-- invariant 9). Comparing against a UTC date would bring a scheduled price change into effect up
-- to eight hours early — a small window in which riders are quoted a price nobody approved yet.
--
-- Returns the LATEST effective card, not every card that has ever taken effect: unlike commission
-- tiers, where the whole active set is one schedule, rate cards supersede one another. Picking the
-- most recent one whose date has arrived is what "the price today" means.
--
-- This is a lookup, not money math. The fare arithmetic stays in packages/pricing (root CLAUDE.md
-- invariant 5), and validateRateCard() still checks whatever this returns.

create or replace function public.active_fare_rate_card(p_market text)
returns setof fare_rate_cards
language sql
stable
set search_path = public, pg_temp
as $$
  select *
  from fare_rate_cards
  where market = p_market
    and active
    and effective_from <= (now() at time zone 'America/Los_Angeles')::date
  order by effective_from desc
  limit 1;
$$;

comment on function public.active_fare_rate_card(text) is
  'The fare rate card in force for a market today, or no rows if none has taken effect. Day '
  'boundary is America/Los_Angeles, matching rido_year_month() — see root CLAUDE.md invariant 9.';

-- Readable by any signed-in user, matching fare_rate_cards_select_authenticated: a rider is shown
-- a price before booking. STABLE and read-only.
grant execute on function public.active_fare_rate_card(text) to authenticated, service_role;
