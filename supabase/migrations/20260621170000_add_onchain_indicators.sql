-- ============================================================
-- ON-CHAIN INDICATORS (Bitcoin network & on-chain metrics) — data layer
-- Spec: docs/features/onchain-indicators/
--   feature-spec.md (data model, indexes, RLS, trigger)
--   views.sql (v_onchain_series, v_hash_ribbons, v_onchain_dashboard)
--   seed.sql (8 display metrics + 5 raw inputs)
--
-- Sibling of economic_indicators (20260620000000), reusing its registry +
-- observation-series pattern, but a SEPARATE table because on-chain data is
-- shaped differently: daily (no period-vs-release gap), and several display
-- metrics are DERIVED from others.
--
-- STORAGE DECISION: onchain_observations holds ONLY raw fetched series. The
-- derived display metrics (fee_share, realised_price, hash_ribbons) are computed
-- in the views below, never stored — honouring computed-over-stored. MVRV is
-- fetched directly from Coin Metrics, so it is a normal fetched row, not derived.
-- ============================================================


-- ── Registry: one row per indicator (display metrics AND raw inputs) ──────────
CREATE TABLE IF NOT EXISTS onchain_indicators (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key                   TEXT NOT NULL UNIQUE,          -- stable slug, e.g. 'hash_rate'
  name                  TEXT NOT NULL,                 -- display name
  short_label           TEXT NOT NULL,                 -- compact card label
  metric_group          TEXT NOT NULL
                        CHECK (metric_group IN ('network_security','behaviour_valuation')),
  -- 'fetched' = pulled from a provider; 'derived' = computed in a view.
  derivation            TEXT NOT NULL DEFAULT 'fetched'
                        CHECK (derivation IN ('fetched','derived')),
  -- Provider is NULL for derived rows (they are not polled).
  provider              TEXT
                        CHECK (provider IN ('mempool','coinmetrics')),
  provider_metric_code  TEXT,                          -- e.g. CM 'CapRealUSD'; NULL for derived
  -- Documents the formula + input keys for derived rows. '{}' for fetched.
  -- This is METADATA only — the view implements each formula explicitly.
  derivation_spec       JSONB NOT NULL DEFAULT '{}'::jsonb,
  unit                  TEXT NOT NULL,                 -- 'eh_s','ratio','usd','percent','count','signal','btc'
  decimals              INT  NOT NULL DEFAULT 2,       -- display precision
  poll_frequency        TEXT NOT NULL DEFAULT 'daily'
                        CHECK (poll_frequency IN ('daily')),
  -- true for the 8 headline cards; false for raw inputs that only feed derived ones.
  is_displayed          BOOLEAN NOT NULL DEFAULT TRUE,
  -- What proposes a content beat. '{}' = no alert. See feature-spec alert_config shape.
  alert_config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  notes                 TEXT,
  created_by            UUID REFERENCES team_members(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Derived rows are never polled, so they must not carry a provider; fetched
  -- rows must. Belt-and-braces alongside the per-column CHECKs above.
  CONSTRAINT onchain_derivation_provider CHECK (
    (derivation = 'derived'  AND provider IS NULL) OR
    (derivation = 'fetched'  AND provider IS NOT NULL)
  )
);


-- ── Observation time series: raw fetched values only ──────────────────────────
-- One row per (indicator, day, vintage). Append/supersede-only — no updated_at,
-- which keeps it a clean audit trail. observed_at is the UTC calendar day the
-- value pertains to (= the day it was computed from chain data).
CREATE TABLE IF NOT EXISTS onchain_observations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id     UUID NOT NULL REFERENCES onchain_indicators(id) ON DELETE CASCADE,
  observed_at      DATE NOT NULL,
  -- Wide enough for realised cap (USD, ~1e12) and precise enough for ratios.
  value            NUMERIC(24,6) NOT NULL,
  is_current       BOOLEAN NOT NULL DEFAULT TRUE,    -- latest vintage for this observed_at
  is_revision      BOOLEAN NOT NULL DEFAULT FALSE,   -- supersedes an earlier value for this day
  superseded_value NUMERIC(24,6),                    -- the prior value this revision replaced
  source           TEXT NOT NULL
                   CHECK (source IN ('mempool','coinmetrics')),
  raw              JSONB NOT NULL DEFAULT '{}'::jsonb,  -- provider payload slice, for re-parse
  ingested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- when we fetched it
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_onchain_obs_indicator
  ON onchain_observations(indicator_id);
CREATE INDEX IF NOT EXISTS idx_onchain_obs_observed
  ON onchain_observations(indicator_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_onchain_obs_current
  ON onchain_observations(indicator_id, is_current) WHERE is_current = true;
-- Multiple vintages of one day coexist; uniqueness is on the vintage triple.
CREATE UNIQUE INDEX IF NOT EXISTS uq_onchain_obs_vintage
  ON onchain_observations(indicator_id, observed_at, ingested_at);

CREATE INDEX IF NOT EXISTS idx_onchain_indicators_group
  ON onchain_indicators(metric_group);
CREATE INDEX IF NOT EXISTS idx_onchain_indicators_active
  ON onchain_indicators(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_onchain_indicators_displayed
  ON onchain_indicators(is_displayed) WHERE is_displayed = true;


-- ── updated_at trigger (reuses the existing shared function) ──────────────────
DROP TRIGGER IF EXISTS onchain_indicators_updated_at ON onchain_indicators;
CREATE TRIGGER onchain_indicators_updated_at
  BEFORE UPDATE ON onchain_indicators
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── Row level security ────────────────────────────────────────────────────────
-- Agents poll/write via service_role; team members read/write via authenticated.
ALTER TABLE onchain_indicators   ENABLE ROW LEVEL SECURITY;
ALTER TABLE onchain_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onchain_indicators_all" ON onchain_indicators;
CREATE POLICY "onchain_indicators_all" ON onchain_indicators
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

DROP POLICY IF EXISTS "onchain_observations_all" ON onchain_observations;
CREATE POLICY "onchain_observations_all" ON onchain_observations
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));


-- ============================================================
-- VIEWS
-- Created in dependency order: v_onchain_dashboard depends on v_hash_ribbons,
-- so drop dashboard → ribbons → series, then rebuild series → ribbons → dashboard.
--
-- CAVEAT (Hash Ribbons window): the moving averages use ROWS BETWEEN N PRECEDING,
-- which counts ROWS, not calendar days. Correct only if hash_rate has one
-- contiguous row per day. A polling gap shortens the effective window. For
-- reliable daily polling this is fine; if gaps appear, switch to a date-ranged
-- window or gap-fill. Flagged in feature-spec Open Questions.
-- ============================================================

DROP VIEW IF EXISTS v_onchain_dashboard;
DROP VIEW IF EXISTS v_hash_ribbons;
DROP VIEW IF EXISTS v_onchain_series;


-- ── Sparkline source: current fetched observations, ordered ──────────────────
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


-- ── Hash Ribbons: 30d/60d MA of hash rate, spread, signal ────────────────────
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


-- ── Dashboard: one row per DISPLAY metric (fetched + derived) ────────────────
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
-- SEED — 8 display metrics (is_displayed = true) + 5 raw inputs (is_displayed
-- = false). Derived rows have provider = NULL and a derivation_spec; they are
-- NOT polled and store NO observations.
--
-- mempool.space: free, no key. HASH RATE MUST be normalised to EH/s in the
--   adapter (raw H/s overflows a JS float) — see adapter-contract.md.
-- Coin Metrics community: free, no key. CONFIRM each metric shows community:true
--   in the CM catalog before relying on it.
--
-- Idempotent: each row is inserted only if its key is not already present.
-- created_by left NULL.
-- ============================================================

INSERT INTO onchain_indicators
  (key, name, short_label, metric_group, derivation, provider,
   provider_metric_code, derivation_spec, unit, decimals,
   poll_frequency, is_displayed, alert_config, is_active, notes)
SELECT v.key, v.name, v.short_label, v.metric_group, v.derivation, v.provider,
       v.provider_metric_code, v.derivation_spec::jsonb, v.unit, v.decimals,
       v.poll_frequency, v.is_displayed, v.alert_config::jsonb, v.is_active, v.notes
FROM (VALUES

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
    'DERIVED in v_onchain_dashboard. Security-budget-transition story as the subsidy halves.' ),

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
    'DERIVED in v_onchain_dashboard = realised_cap / supply. The network''s aggregate cost basis. USD (AUD deferred).' ),

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
    'mempool /v1/mining/hashrate. Raw difficulty series for context; next_difficulty_adjustment is the displayed metric.' )

) AS v(key, name, short_label, metric_group, derivation, provider,
       provider_metric_code, derivation_spec, unit, decimals,
       poll_frequency, is_displayed, alert_config, is_active, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM onchain_indicators e WHERE e.key = v.key
);
