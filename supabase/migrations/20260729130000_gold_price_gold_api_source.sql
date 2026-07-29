-- ── Repoint the gold indicator from Stooq to the Gold API ──────────────────────
-- The 20260719000000 migration moved gold from FRED (discontinued series) to
-- Stooq's keyless CSV feed. That has never actually worked: every single
-- indicator_poll run since (10+ consecutive days) failed with the same error —
-- Stooq answers with an HTML "verify your browser" bot-check page instead of
-- CSV for server-side requests, not a transient rate limit. Gold has had zero
-- observations in indicator_observations the entire time. Adapter:
-- apps/agents/src/lib/indicators/adapters/goldApi.ts.

-- 1. Allow 'gold_api' as a registry provider and an observation source. Same
--    DROP/ADD widening pattern used for 'stooq' (20260719000000) and 'oecd'
--    (20260621000000_add_indicator_activity_category.sql).
ALTER TABLE economic_indicators DROP CONSTRAINT IF EXISTS economic_indicators_provider_check;
ALTER TABLE economic_indicators
  ADD CONSTRAINT economic_indicators_provider_check
  CHECK (provider IN ('fred','rba','abs','oecd','stooq','gold_api'));

ALTER TABLE indicator_observations DROP CONSTRAINT IF EXISTS indicator_observations_source_check;
ALTER TABLE indicator_observations
  ADD CONSTRAINT indicator_observations_source_check
  CHECK (source IN ('fred','rba','abs','oecd','stooq','gold_api','manual'));

-- 2. Clear the (empty, but be safe) current-vintage rows the Stooq source left
--    behind, so the next poll runs a clean first-ingest.
DELETE FROM indicator_observations
WHERE indicator_id IN (SELECT id FROM economic_indicators WHERE name = 'Gold (USD/oz)');

-- 3. Repoint the gold registry row. provider_series_code is cleared — the Gold
--    API endpoint is fixed (https://api.gold-api.com/price/XAU), no per-series
--    code needed.
UPDATE economic_indicators
SET provider = 'gold_api',
    provider_series_code = NULL,
    notes = 'Gold API (api.gold-api.com) = spot gold, USD per troy ounce, current price only '
         || '(no backfill endpoint used; history accumulates one poll at a time). Free, keyless. '
         || 'Replaces Stooq (20260719000000), whose keyless CSV feed serves a bot-verification '
         || 'HTML page to server-side requests instead of data.'
WHERE name = 'Gold (USD/oz)';
