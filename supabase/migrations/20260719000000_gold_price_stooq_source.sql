-- ── Repoint the gold indicator from FRED to Stooq ───────────────────────────────
-- The daily gold series was seeded against FRED GOLDAMGBD228NLBM (the LBMA 10:30am
-- London fixing). That FRED series is DISCONTINUED — FRED no longer serves current
-- observations for it — so the daily indicator_poll could never pull a fresh gold
-- price, and gold never came through on the dashboard or the market report while
-- the other daily series (DXY/S&P 500/US 10Y) polled fine. FRED's free tier has no
-- usable current daily spot-gold series, so we move gold to Stooq, a free keyless
-- daily CSV feed (XAUUSD, spot gold USD/oz). Adapter: apps/agents/src/lib/
-- indicators/adapters/stooq.ts.

-- 1. Allow 'stooq' as a registry provider and an observation source. Same
--    DROP/ADD widening pattern used when 'oecd' was added
--    (20260621000000_add_indicator_activity_category.sql).
ALTER TABLE economic_indicators DROP CONSTRAINT IF EXISTS economic_indicators_provider_check;
ALTER TABLE economic_indicators
  ADD CONSTRAINT economic_indicators_provider_check
  CHECK (provider IN ('fred','rba','abs','oecd','stooq'));

ALTER TABLE indicator_observations DROP CONSTRAINT IF EXISTS indicator_observations_source_check;
ALTER TABLE indicator_observations
  ADD CONSTRAINT indicator_observations_source_check
  CHECK (source IN ('fred','rba','abs','oecd','stooq','manual'));

-- 2. Clear any observations the discontinued FRED series left behind, so the next
--    poll runs a clean first-ingest backfill from Stooq (first-ingest is detected
--    by "no current observations exist" in runIndicatorPoll). Safe whether the old
--    source inserted stale rows or none at all.
DELETE FROM indicator_observations
WHERE indicator_id IN (SELECT id FROM economic_indicators WHERE name = 'Gold (USD/oz)');

-- 3. Repoint the gold registry row. Unit/decimals/granularity are unchanged
--    (USD/oz, 2dp, daily); only the source and its series code move.
UPDATE economic_indicators
SET provider = 'stooq',
    provider_series_code = 'xauusd',
    notes = 'Stooq XAUUSD = spot gold, USD per troy ounce, daily bars (Close). '
         || 'Free, keyless CSV feed. Replaces the discontinued FRED LBMA fixing '
         || 'series GOLDAMGBD228NLBM, which no longer serves current values.'
WHERE name = 'Gold (USD/oz)';
