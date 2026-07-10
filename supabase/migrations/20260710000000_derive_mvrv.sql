-- ── Derive MVRV locally instead of fetching CapMVRVCur ───────────────────────
-- Coin Metrics' CapMVRVCur is NOT on the free community tier: the keyless
-- community host answers HTTP 403 for any request that includes it, which (because
-- the adapter batches every CM metric into one call) was sinking price, supply,
-- active addresses and realised cap alongside it — the whole coinmetrics leg had
-- zero observations for weeks. See docs/schema-changes.md.
--
-- MVRV is not independent data: it is market value ÷ realised value, and both
-- inputs are already community-entitled and ingesting. So compute it ourselves —
-- the same formula CM uses for CapMVRVCur —
--
--   MVRV = market cap / realised cap = (btc_price_usd × supply) / realised_cap
--
-- This mirrors realised_price (already derived from realised_cap ÷ supply). MVRV
-- becomes a `derived` row: no provider, no polling, no CapMVRVCur in the batch, so
-- the community request stops 403-ing.

-- 1. Flip the registry row fetched → derived. The onchain_derivation_provider
--    CHECK requires a derived row to carry no provider.
UPDATE onchain_indicators
SET derivation           = 'derived',
    provider             = NULL,
    provider_metric_code = NULL,
    derivation_spec      = '{"type":"ratio","numerator":"market_cap","denominator_key":"realised_cap","inputs":["btc_price_usd","supply","realised_cap"],"formula":"(btc_price_usd * supply) / realised_cap","note":"MVRV = market value / realised value; same definition as CM CapMVRVCur, computed locally because CapMVRVCur is Pro-gated."}'::jsonb,
    notes                = 'DERIVED in v_onchain_dashboard = (btc_price_usd × supply) / realised_cap — the network''s market value over its realised (cost-basis) value. Same definition as CM CapMVRVCur; computed locally because CapMVRVCur is not on the free community tier. Bands are illustrative historical extremes, NOT advice.'
WHERE key = 'mvrv';

-- 2. A derived metric stores no observations. None exist today (CapMVRVCur never
--    ingested), but drop any stray vintages so the invariant holds after the flip.
DELETE FROM onchain_observations o
USING onchain_indicators i
WHERE o.indicator_id = i.id AND i.key = 'mvrv';

-- ============================================================
-- VIEWS
-- v_onchain_dashboard depends on the new v_btc_mvrv, so drop the dashboard first,
-- create the per-day MVRV series, then rebuild the dashboard. v_hash_ribbons,
-- v_btc_trend / v_btc_trend_metrics and v_onchain_series are untouched.
-- ============================================================

DROP VIEW IF EXISTS v_onchain_dashboard;
DROP VIEW IF EXISTS v_btc_mvrv;

-- ── Per-day MVRV series ───────────────────────────────────────────────────────
-- One row per day where all three current inputs align (they are polled together
-- from Coin Metrics, so they share observed_at). Feeds both the dashboard card and
-- the MVRV band alert in runOnchainPoll (which reads latest + prior from here).
CREATE VIEW v_btc_mvrv AS
WITH price AS (SELECT observed_at, value FROM v_onchain_series WHERE key = 'btc_price_usd'),
     supply AS (SELECT observed_at, value FROM v_onchain_series WHERE key = 'supply'),
     rcap  AS (SELECT observed_at, value FROM v_onchain_series WHERE key = 'realised_cap')
SELECT
  p.observed_at,
  (p.value * s.value) / NULLIF(r.value, 0) AS mvrv
FROM price p
JOIN supply s ON s.observed_at = p.observed_at
JOIN rcap  r ON r.observed_at = p.observed_at
ORDER BY p.observed_at;

-- ── Dashboard: one row per DISPLAY metric (fetched + derived + trend) ─────────
-- Rebuilt from 20260708000000 with one change: the mvrv card is now sourced from
-- v_btc_mvrv (latest + prior-day delta) instead of a fetched observation row.
CREATE VIEW v_onchain_dashboard AS
WITH ranked AS (
  SELECT
    o.indicator_id,
    i.key, i.name, i.short_label, i.metric_group, i.unit, i.decimals,
    i.is_displayed, i.derivation,
    o.observed_at, o.value,
    ROW_NUMBER() OVER (PARTITION BY o.indicator_id ORDER BY o.observed_at DESC) AS rn
  FROM onchain_observations o
  JOIN onchain_indicators i ON i.id = o.indicator_id
  WHERE o.is_current = true
),
fetched_latest AS (
  SELECT r.*, p.value AS prior_value
  FROM ranked r
  LEFT JOIN ranked p ON p.indicator_id = r.indicator_id AND p.rn = 2
  WHERE r.rn = 1
),
inp AS (
  SELECT
    MAX(value) FILTER (WHERE key = 'miner_fees_total')    AS miner_fees,
    MAX(value) FILTER (WHERE key = 'miner_revenue_total') AS miner_revenue,
    MAX(value) FILTER (WHERE key = 'realised_cap')        AS realised_cap,
    MAX(value) FILTER (WHERE key = 'supply')              AS supply,
    MAX(observed_at) FILTER (WHERE key IN ('miner_fees_total','miner_revenue_total')) AS fee_obs,
    MAX(observed_at) FILTER (WHERE key IN ('realised_cap','supply'))                  AS rp_obs
  FROM fetched_latest
)

SELECT
  fl.key, fl.name, fl.short_label, fl.metric_group, fl.unit, fl.decimals,
  fl.value,
  fl.observed_at,
  (fl.value - fl.prior_value)                                   AS change_since_prior,
  CASE WHEN fl.prior_value IS NOT NULL AND fl.prior_value <> 0
       THEN ROUND(((fl.value - fl.prior_value) / ABS(fl.prior_value)) * 100, 2)
  END                                                           AS pct_change_since_prior,
  (CURRENT_DATE - fl.observed_at)                               AS days_since_observed,
  NULL::text                                                    AS signal
FROM fetched_latest fl
WHERE fl.is_displayed = true AND fl.derivation = 'fetched'

UNION ALL
SELECT
  'fee_share', 'Fee Share of Miner Revenue', 'Fee Share', 'network_security', 'percent', 1,
  ROUND((inp.miner_fees / NULLIF(inp.miner_revenue, 0)) * 100, 1),
  inp.fee_obs,
  NULL::numeric, NULL::numeric,
  (CURRENT_DATE - inp.fee_obs),
  NULL::text
FROM inp
WHERE inp.miner_revenue IS NOT NULL

UNION ALL
SELECT
  'realised_price', 'Realised Price', 'Realised Price', 'behaviour_valuation', 'usd', 0,
  ROUND(inp.realised_cap / NULLIF(inp.supply, 0), 0),
  inp.rp_obs,
  NULL::numeric, NULL::numeric,
  (CURRENT_DATE - inp.rp_obs),
  NULL::text
FROM inp
WHERE inp.supply IS NOT NULL

UNION ALL
-- mvrv (derived = (btc_price_usd × supply) / realised_cap), latest with day-delta
SELECT
  'mvrv', 'MVRV Ratio', 'MVRV', 'behaviour_valuation', 'ratio', 2,
  ROUND(m.mvrv, 2),
  m.observed_at,
  ROUND(m.mvrv - m.prior_mvrv, 2),
  CASE WHEN m.prior_mvrv IS NOT NULL AND m.prior_mvrv <> 0
       THEN ROUND(((m.mvrv - m.prior_mvrv) / ABS(m.prior_mvrv)) * 100, 2)
  END,
  (CURRENT_DATE - m.observed_at),
  NULL::text
FROM (
  SELECT observed_at, mvrv, LAG(mvrv) OVER (ORDER BY observed_at) AS prior_mvrv
  FROM v_btc_mvrv
  ORDER BY observed_at DESC
  LIMIT 1
) m
WHERE m.mvrv IS NOT NULL

UNION ALL
SELECT
  'hash_ribbons', 'Hash Ribbons', 'Hash Ribbons', 'network_security', 'signal', 2,
  hr.spread_pct,
  hr.observed_at,
  NULL::numeric, NULL::numeric,
  (CURRENT_DATE - hr.observed_at),
  hr.signal
FROM (SELECT * FROM v_hash_ribbons ORDER BY observed_at DESC LIMIT 1) hr

UNION ALL
-- trend_valuation (derived from the BTC/USD close series)
SELECT
  key, name, short_label, metric_group, unit, decimals,
  value, observed_at, change_since_prior, pct_change_since_prior,
  days_since_observed, signal
FROM v_btc_trend_metrics;
