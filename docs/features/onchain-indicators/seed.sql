-- ============================================================
-- SEED — onchain_indicators (v1)
-- Part of: docs/features/onchain-indicators  (see ../feature-spec.md)
-- Run AFTER onchain_indicators exists and AFTER sql/views.sql.
-- ============================================================
--
-- CONFIDENCE NOTES — read before trusting blindly:
--   mempool.space: free, no key. Endpoints stable; field names confirmed
--     against live docs (currentHashrate, difficultyChange, pool share,
--     reward-stats totalReward/totalFee). HASH RATE MUST be normalised to
--     EH/s in the adapter (raw H/s overflows a JS float) — see adapter contract.
--   Coin Metrics community: free, no key, ~1.6 req/s. Metric ids
--     (CapMVRVCur, CapRealUSD, SplyCur, AdrActCnt) are standard, but CONFIRM
--     each shows community:true in the CM catalog before relying on it.
--
--   8 DISPLAY metrics (is_displayed = true) are the dashboard cards.
--   The other rows are RAW INPUTS (is_displayed = false) that exist only to
--   feed derived metrics in views.sql. Derived rows have provider = NULL and
--   a derivation_spec; they are NOT polled and store NO observations.
--
--   created_by left NULL. Swap for a team_members subquery if you want provenance.
-- ============================================================

INSERT INTO onchain_indicators
  (key, name, short_label, metric_group, derivation, provider,
   provider_metric_code, derivation_spec, unit, decimals,
   poll_frequency, is_displayed, alert_config, is_active, notes)
VALUES

-- ── NETWORK SECURITY — display ──────────────────────────────
( 'hash_rate', 'Network Hash Rate (7d)', 'Hash Rate', 'network_security', 'fetched', 'mempool',
  'hashrate.currentHashrate', '{}', 'eh_s', 1,
  'daily', true, '{"drop_pct_over_days": {"pct": 10, "days": 14}}', true,
  'mempool /v1/mining/hashrate. Adapter divides H/s by 1e18 to EH/s.' ),

( 'next_difficulty_adjustment', 'Next Difficulty Adjustment', 'Next Diff Adj', 'network_security', 'fetched', 'mempool',
  'difficulty-adjustment.difficultyChange', '{}', 'percent', 2,
  'daily', true, '{}', true,
  'mempool /v1/difficulty-adjustment. Forward ESTIMATE (%), wobbles intra-period; retarget ETA from same payload.' ),

( 'pool_concentration_top', 'Top Mining Pool Share', 'Top Pool', 'network_security', 'fetched', 'mempool',
  'pools.top_share', '{}', 'percent', 1,
  'daily', true, '{}', true,
  'mempool /v1/mining/hashrate/pools. Max pool share x100. Attribution drifts as pools rebrand — indicative.' ),

( 'fee_share', 'Fee Share of Miner Revenue', 'Fee Share', 'network_security', 'derived', NULL,
  NULL, '{"type":"ratio","numerator_key":"miner_fees_total","denominator_key":"miner_revenue_total","as_percent":true}',
  'percent', 1,
  'daily', true, '{}', true,
  'DERIVED in views.sql. Security-budget-transition story as the subsidy halves.' ),

( 'hash_ribbons', 'Hash Ribbons', 'Hash Ribbons', 'network_security', 'derived', NULL,
  NULL, '{"type":"hash_ribbons","source_key":"hash_rate","fast_days":30,"slow_days":60}',
  'signal', 2,
  'daily', true, '{"on_signal_change": true}', true,
  'DERIVED in v_hash_ribbons. Value is the 30d/60d spread %; signal is capitulation/recovery/neutral.' ),

-- ── HOLDER BEHAVIOUR & VALUATION — display ──────────────────
( 'mvrv', 'MVRV Ratio', 'MVRV', 'behaviour_valuation', 'fetched', 'coinmetrics',
  'CapMVRVCur', '{}', 'ratio', 2,
  'daily', true, '{"bands": [{"below": 1.0}, {"above": 3.5}]}', true,
  'CM CapMVRVCur, fetched directly (not derived). Bands are illustrative historical extremes, NOT advice.' ),

( 'realised_price', 'Realised Price', 'Realised Price', 'behaviour_valuation', 'derived', NULL,
  NULL, '{"type":"ratio","numerator_key":"realised_cap","denominator_key":"supply"}',
  'usd', 0,
  'daily', true, '{}', true,
  'DERIVED in views.sql = realised_cap / supply. The network''s aggregate cost basis. USD (AUD deferred).' ),

( 'active_addresses', 'Active Addresses', 'Active Addrs', 'behaviour_valuation', 'fetched', 'coinmetrics',
  'AdrActCnt', '{}', 'count', 0,
  'daily', true, '{}', true,
  'CM AdrActCnt. Usage / adoption signal, independent of price.' ),

-- ── RAW INPUTS — not displayed, feed derived metrics ────────
( 'miner_revenue_total', 'Miner Revenue (daily total)', 'Miner Revenue', 'network_security', 'fetched', 'mempool',
  'reward-stats.totalReward', '{}', 'btc', 4,
  'daily', false, '{}', true,
  'mempool /v1/mining/reward-stats. Feeds fee_share. Document sats->BTC convention and the block-count window.' ),

( 'miner_fees_total', 'Miner Fees (daily total)', 'Miner Fees', 'network_security', 'fetched', 'mempool',
  'reward-stats.totalFee', '{}', 'btc', 4,
  'daily', false, '{}', true,
  'mempool /v1/mining/reward-stats. Feeds fee_share. Same window as miner_revenue_total.' ),

( 'realised_cap', 'Realised Cap', 'Realised Cap', 'behaviour_valuation', 'fetched', 'coinmetrics',
  'CapRealUSD', '{}', 'usd', 0,
  'daily', false, '{}', true,
  'CM CapRealUSD. Feeds realised_price. Promote to is_displayed = true if you want it as its own card.' ),

( 'supply', 'Circulating Supply', 'Supply', 'behaviour_valuation', 'fetched', 'coinmetrics',
  'SplyCur', '{}', 'btc', 0,
  'daily', false, '{}', true,
  'CM SplyCur. Feeds realised_price.' ),

( 'difficulty', 'Difficulty', 'Difficulty', 'network_security', 'fetched', 'mempool',
  'hashrate.currentDifficulty', '{}', 'ratio', 0,
  'daily', false, '{}', true,
  'mempool /v1/mining/hashrate. Raw difficulty series for context; next_difficulty_adjustment is the displayed metric.' );
