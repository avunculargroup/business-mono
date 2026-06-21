-- ============================================================
-- VIEWS — on-chain indicators
-- Part of: docs/features/onchain-indicators  (see ../feature-spec.md)
-- Run AFTER the onchain_indicators + onchain_observations tables exist,
-- and BEFORE sql/seed.sql is needed by the app (seed has no view dependency,
-- but the dashboard view does depend on v_hash_ribbons — create in the order below).
-- ============================================================
--
-- DESIGN: onchain_observations stores ONLY raw fetched series. The derived
-- display metrics (fee_share, realised_price, hash_ribbons) are computed HERE,
-- never stored — honouring computed-over-stored. MVRV is fetched directly from
-- Coin Metrics, so it is a normal fetched row, not derived.
--
-- CAVEAT (Hash Ribbons window): the moving averages use ROWS BETWEEN N PRECEDING,
-- which counts ROWS, not calendar days. This is correct only if hash_rate has one
-- contiguous row per day. A polling gap shortens the effective window. For reliable
-- daily polling this is fine; if gaps appear, switch to a date-ranged window or
-- gap-fill. Flagged in feature-spec Open Questions.
-- ============================================================

DROP VIEW IF EXISTS v_onchain_dashboard;
DROP VIEW IF EXISTS v_hash_ribbons;
DROP VIEW IF EXISTS v_onchain_series;

-- ── Sparkline source: current fetched observations, ordered ──
CREATE VIEW v_onchain_series AS
  SELECT
    o.indicator_id,
    i.key,
    i.short_label,
    o.observed_at,
    o.value
  FROM onchain_observations o
  JOIN onchain_indicators i ON i.id = o.indicator_id
  WHERE o.is_current = true
  ORDER BY o.indicator_id, o.observed_at ASC;


-- ── Hash Ribbons: 30d/60d MA of hash rate, spread, signal ────
CREATE VIEW v_hash_ribbons AS
WITH hr AS (
  SELECT o.observed_at, o.value
  FROM onchain_observations o
  JOIN onchain_indicators i ON i.id = o.indicator_id
  WHERE i.key = 'hash_rate' AND o.is_current = true
),
ma AS (
  SELECT
    observed_at,
    value,
    AVG(value) OVER (ORDER BY observed_at ROWS BETWEEN 29 PRECEDING AND CURRENT ROW) AS ma30,
    AVG(value) OVER (ORDER BY observed_at ROWS BETWEEN 59 PRECEDING AND CURRENT ROW) AS ma60,
    COUNT(*)   OVER (ORDER BY observed_at ROWS BETWEEN 59 PRECEDING AND CURRENT ROW) AS n
  FROM hr
),
flagged AS (
  SELECT
    observed_at, value, ma30, ma60,
    CASE WHEN ma30 >= ma60 THEN 1 ELSE 0 END AS above,
    LAG(CASE WHEN ma30 >= ma60 THEN 1 ELSE 0 END)
      OVER (ORDER BY observed_at) AS prev_above
  FROM ma
  WHERE n >= 60     -- only meaningful once 60 days of history exist
)
SELECT
  observed_at,
  value AS hash_rate_eh_s,
  ROUND(ma30::numeric, 2) AS ma30,
  ROUND(ma60::numeric, 2) AS ma60,
  ROUND(((ma30 / NULLIF(ma60, 0)) - 1) * 100, 2) AS spread_pct,
  CASE
    WHEN above = 1 AND prev_above = 0 THEN 'recovery'      -- 30d just crossed back above 60d
    WHEN above = 1                    THEN 'neutral'        -- above, no fresh cross
    ELSE 'capitulation'                                     -- 30d below 60d
  END AS signal
FROM flagged
ORDER BY observed_at;


-- ── Dashboard: one row per DISPLAY metric (fetched + derived) ─
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
inp AS (   -- pivot the raw inputs the derived metrics need
  SELECT
    MAX(value) FILTER (WHERE key = 'miner_fees_total')    AS miner_fees,
    MAX(value) FILTER (WHERE key = 'miner_revenue_total') AS miner_revenue,
    MAX(value) FILTER (WHERE key = 'realised_cap')        AS realised_cap,
    MAX(value) FILTER (WHERE key = 'supply')              AS supply,
    MAX(observed_at) FILTER (WHERE key IN ('miner_fees_total','miner_revenue_total')) AS fee_obs,
    MAX(observed_at) FILTER (WHERE key IN ('realised_cap','supply'))                  AS rp_obs
  FROM fetched_latest
)

-- fetched display metrics (with day-over-day deltas)
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
-- fee_share (derived)
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
-- realised_price (derived)
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
-- hash_ribbons (derived, latest signal)
SELECT
  'hash_ribbons', 'Hash Ribbons', 'Hash Ribbons', 'network_security', 'signal', 2,
  hr.spread_pct,
  hr.observed_at,
  NULL::numeric, NULL::numeric,
  (CURRENT_DATE - hr.observed_at),
  hr.signal
FROM (SELECT * FROM v_hash_ribbons ORDER BY observed_at DESC LIMIT 1) hr;

-- ============================================================
-- Derived metrics carry NULL day-over-day deltas in v1 (computing them needs
-- prior derived values — a small extension, deferred). Fetched metrics have
-- full deltas. The dashboard card handles a NULL delta the same way it handles
-- a not-yet-a-year-old YoY in the macro panel: it just hides it.
--
-- Sanity check after seeding + a ~90-day backfill:
--   SELECT key, metric_group, value, signal, observed_at FROM v_onchain_dashboard
--   ORDER BY metric_group, key;
-- ============================================================
