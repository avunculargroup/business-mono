-- ── Repoint realised_cap from Coin Metrics to BGeometrics ──────────────────────
-- Coin Metrics' free community tier has never served CapRealUSD: zero
-- observations in onchain_observations since the feature launched
-- (20260621170000), while its sibling community metrics on the same batched
-- call (SplyCur, AdrActCnt) have ~36,000 rows apiece going back to 2019. Same
-- Pro-gating that hit CapMVRVCur (20260710000000_derive_mvrv.sql) — except
-- realised cap can't be derived from data already on hand (it's cost-basis-
-- weighted, not price × supply), so it needs an actual replacement source.
-- This is why `realised_price` (realised_cap / supply) has never displayed,
-- and — since 20260710000000 made `mvrv` derived from realised_cap too — why
-- the mvrv card has silently been missing from the dashboard as well.
--
-- Adapter: apps/agents/src/lib/onchain/adapters/bgeometrics.ts. Needs
-- BGEOMETRICS_API_KEY set (Railway) — free self-serve key at
-- portal.bgeometrics.com, no card required.

-- 1. Widen the provider/source registries.
ALTER TABLE onchain_indicators DROP CONSTRAINT IF EXISTS onchain_indicators_provider_check;
ALTER TABLE onchain_indicators
  ADD CONSTRAINT onchain_indicators_provider_check
  CHECK (provider IN ('mempool','coinmetrics','coingecko','alternative_me','bgeometrics'));

ALTER TABLE onchain_observations DROP CONSTRAINT IF EXISTS onchain_observations_source_check;
ALTER TABLE onchain_observations
  ADD CONSTRAINT onchain_observations_source_check
  CHECK (source IN ('mempool','coinmetrics','coingecko','alternative_me','bgeometrics'));

-- 2. Repoint the realised_cap registry row. No observations to clear — it has
--    never had any.
UPDATE onchain_indicators
SET provider             = 'bgeometrics',
    provider_metric_code = 'realized-cap',
    notes                = 'BGeometrics (api.bgeometrics.com) realized-cap. Feeds realised_price and mvrv. '
                         || 'Replaces Coin Metrics CapRealUSD, which the free community tier never actually '
                         || 'served (Pro-gated — zero observations ingested since launch, same failure mode '
                         || 'as CapMVRVCur). Free tier needs BGEOMETRICS_API_KEY (Railway env var).'
WHERE key = 'realised_cap';
