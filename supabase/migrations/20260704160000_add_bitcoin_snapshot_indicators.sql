-- ── Bitcoin snapshot: block height, BTC/AUD price, Fear & Greed Index ──
-- Reuses the onchain_indicators/onchain_observations pair (20260621170000) so
-- these three get daily history for free via the existing onchain_poll routine
-- and its generic provider/adapter loop (runOnchainPoll.ts needs no changes —
-- it is already generic over provider). Two new keyless providers: CoinGecko
-- (BTC/AUD spot) and alternative.me (Fear & Greed) — same endpoints
-- apps/web's dashboard widgets already use for live display, so results should
-- track what the team sees on /dashboard. Block height reuses the mempool
-- adapter (new /blocks/tip/height branch).
--
-- The DAILY REPORT (market_report routine) displays these three "live"
-- (fetched fresh at send time via the same adapters, not the last poll's
-- stored value) rather than reading them from v_onchain_dashboard like every
-- other on-chain metric — see apps/agents/src/lib/report/runMarketReport.ts.
-- The stored observations below exist for history and to compute the report's
-- day-over-day delta against the live figure.

-- 1. Widen the provider/source registries.
ALTER TABLE onchain_indicators DROP CONSTRAINT IF EXISTS onchain_indicators_provider_check;
ALTER TABLE onchain_indicators
  ADD CONSTRAINT onchain_indicators_provider_check
  CHECK (provider IN ('mempool','coinmetrics','coingecko','alternative_me'));

ALTER TABLE onchain_observations DROP CONSTRAINT IF EXISTS onchain_observations_source_check;
ALTER TABLE onchain_observations
  ADD CONSTRAINT onchain_observations_source_check
  CHECK (source IN ('mempool','coinmetrics','coingecko','alternative_me'));

-- 2. New metric group — none of the three are network-security or
--    holder-behaviour/valuation metrics; they're a plain Bitcoin snapshot.
ALTER TABLE onchain_indicators DROP CONSTRAINT IF EXISTS onchain_indicators_metric_group_check;
ALTER TABLE onchain_indicators
  ADD CONSTRAINT onchain_indicators_metric_group_check
  CHECK (metric_group IN ('network_security','behaviour_valuation','market_snapshot'));

-- 3. Seed the three indicators. is_displayed = true so the web dashboard's
--    v_onchain_dashboard-driven views can also surface them if wired up later;
--    alert_config empty — these exist for the snapshot/history, not content
--    beats. Idempotent on key.
INSERT INTO onchain_indicators
  (key, name, short_label, metric_group, derivation, provider,
   provider_metric_code, derivation_spec, unit, decimals,
   poll_frequency, is_displayed, alert_config, is_active, notes)
SELECT v.key, v.name, v.short_label, v.metric_group, v.derivation, v.provider,
       v.provider_metric_code, v.derivation_spec::jsonb, v.unit, v.decimals,
       v.poll_frequency, v.is_displayed, v.alert_config::jsonb, v.is_active, v.notes
FROM (VALUES

  ( 'block_height', 'Bitcoin Block Height', 'Block Height', 'market_snapshot', 'fetched', 'mempool',
    'blocks.tip.height', '{}', 'count', 0,
    'daily', true, '{}', true,
    'mempool /blocks/tip/height (plain-text integer, not JSON). Mainnet tip.' ),

  ( 'btc_price_aud', 'Bitcoin Price (AUD)', 'BTC/AUD', 'market_snapshot', 'fetched', 'coingecko',
    'bitcoin.aud', '{}', 'aud', 2,
    'daily', true, '{}', true,
    'CoinGecko simple/price, ids=bitcoin, vs_currencies=aud. Same endpoint as the web dashboard card.' ),

  ( 'fear_greed', 'Bitcoin Fear & Greed Index', 'Fear & Greed', 'market_snapshot', 'fetched', 'alternative_me',
    'fng.value', '{}', 'index', 0,
    'daily', true, '{}', true,
    'alternative.me /fng/?limit=1. Classification (Fear/Greed/etc.) carried in raw, surfaced as the report signal chip.' )

) AS v(key, name, short_label, metric_group, derivation, provider,
       provider_metric_code, derivation_spec, unit, decimals,
       poll_frequency, is_displayed, alert_config, is_active, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM onchain_indicators e WHERE e.key = v.key
);
