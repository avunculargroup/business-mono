-- ── US spot Bitcoin ETF flows: daily net flow, flow streak, net assets ─────────
-- Three metrics on the existing onchain_indicators/onchain_observations pair, so
-- they get daily history, supersession and staleness detection for free from the
-- onchain_poll routine's generic provider loop (runOnchainPoll.ts needs no
-- change — it is already generic over provider).
--
-- These are NOT on-chain metrics: they are TradFi fund flows into the US spot
-- ETFs. They reuse the on-chain tables for the machinery, not the meaning —
-- exactly as the market_snapshot group does (20260704160000). Like that group
-- they are excluded from the /dashboard on-chain panel (whose subtitle promises
-- "what the network reports about itself") and surface in the daily market_report
-- email, in their own "ETF Flows" section.
--
-- Provider: SoSoValue (api.sosovalue.xyz OpenAPI v2), a new keyed provider.
-- Needs SOSOVALUE_API_KEY set (Railway), same pattern as BGEOMETRICS_API_KEY.
-- Adapter: apps/agents/src/lib/onchain/adapters/sosovalue.ts.
--
-- UNITS: stored SCALED, not in raw dollars — daily flows in USD millions, total
-- assets in USD billions (the units both the source and every write-up quote
-- them in, and the same trick economic_indicators uses with usd_billion). The
-- adapter divides the API's raw USD figures down; see its header. RESPONSE SHAPE
-- AND UNIT SCALE ARE NOT HAND-VERIFIED (no third-party network egress from the
-- environment this was written in — same situation as the bgeometrics adapter,
-- 20260730120000). Eyeball the first live poll against sosovalue.com before
-- trusting the series: a flow of "98.85" and assets of ~"150" are right; figures
-- off by 1e6 in either direction mean the API returns pre-scaled values and the
-- adapter's divisor must go.

-- 1. Widen the provider/source registries.
ALTER TABLE onchain_indicators DROP CONSTRAINT IF EXISTS onchain_indicators_provider_check;
ALTER TABLE onchain_indicators
  ADD CONSTRAINT onchain_indicators_provider_check
  CHECK (provider IN ('mempool','coinmetrics','coingecko','alternative_me','bgeometrics','sosovalue'));

ALTER TABLE onchain_observations DROP CONSTRAINT IF EXISTS onchain_observations_source_check;
ALTER TABLE onchain_observations
  ADD CONSTRAINT onchain_observations_source_check
  CHECK (source IN ('mempool','coinmetrics','coingecko','alternative_me','bgeometrics','sosovalue'));

-- 2. New metric group — ETF flows are neither network security, holder
--    behaviour, a price snapshot, nor a price-derived trend metric.
ALTER TABLE onchain_indicators DROP CONSTRAINT IF EXISTS onchain_indicators_metric_group_check;
ALTER TABLE onchain_indicators
  ADD CONSTRAINT onchain_indicators_metric_group_check
  CHECK (metric_group IN ('network_security','behaviour_valuation','market_snapshot','trend_valuation','etf_flows'));

-- 3. Seed the three metrics. Idempotent on key.
--    etf_net_flow and etf_net_assets are fetched; etf_flow_streak is DERIVED in
--    v_onchain_dashboard from the flow series (fetched is stored, derived is
--    computed — the feature's founding rule).
--    alert_config empty: a flow run is not a content beat on its own, and a
--    "records keep coming" beat is exactly the advice-adjacent framing Lex
--    exists to catch.
INSERT INTO onchain_indicators
  (key, name, short_label, metric_group, derivation, provider,
   provider_metric_code, derivation_spec, unit, decimals,
   poll_frequency, is_displayed, alert_config, is_active, notes)
SELECT v.key, v.name, v.short_label, v.metric_group, v.derivation, v.provider,
       v.provider_metric_code, v.derivation_spec::jsonb, v.unit, v.decimals,
       v.poll_frequency, v.is_displayed, v.alert_config::jsonb, v.is_active, v.notes
FROM (VALUES

  ( 'etf_net_flow', 'US Spot ETF Net Flow (Daily)', 'ETF Net Flow', 'etf_flows', 'fetched', 'sosovalue',
    'us-btc-spot.totalNetInflow', '{}', 'usd_million', 2,
    'daily', true, '{}', true,
    'SoSoValue OpenAPI v2 historicalInflowChart, type=us-btc-spot. Net flow across all US spot '
    || 'Bitcoin ETFs for one trading session, in USD millions (adapter divides the raw USD figure '
    || 'by 1e6). Trading-day series: no weekend or US-market-holiday rows — the findings staleness '
    || 'tolerance treats it as session-cadence, like the daily FRED macro series.' ),

  ( 'etf_flow_streak', 'US Spot ETF Flow Streak', 'ETF Flow Streak', 'etf_flows', 'derived', NULL,
    NULL, '{"formula":"sum(etf_net_flow) over the current run of consecutive same-direction sessions","view":"v_etf_flow_streak"}',
    'usd_million', 2,
    'daily', true, '{}', true,
    'DERIVED in v_etf_flow_streak: the current unbroken run of same-direction sessions, summed. '
    || 'Variable length — five consecutive inflow days is a five-session streak; a single outflow '
    || 'day ends it and starts a new one. Run length and direction ride along as the neutral signal '
    || 'chip ("5 sessions inflow") — a statement of what the run IS, never a momentum call.' ),

  ( 'etf_net_assets', 'US Spot ETF Net Assets', 'ETF Net Assets', 'etf_flows', 'fetched', 'sosovalue',
    'us-btc-spot.totalNetAssets', '{}', 'usd_billion', 2,
    'daily', true, '{}', true,
    'SoSoValue OpenAPI v2 currentEtfDataMetrics, type=us-btc-spot. Total net assets held across all '
    || 'US spot Bitcoin ETFs, in USD billions (adapter divides the raw USD figure by 1e9). A LEVEL, '
    || 'not a flow: the current endpoint returns one point-in-time figure per poll, so history '
    || 'accumulates a day at a time rather than backfilling.' )

) AS v(key, name, short_label, metric_group, derivation, provider,
       provider_metric_code, derivation_spec, unit, decimals,
       poll_frequency, is_displayed, alert_config, is_active, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM onchain_indicators e WHERE e.key = v.key
);

-- 4. Findings-engine group config (20260720000000). Without a row here the group
--    falls back to thesis_weight 1.0 / vol_class 'low', and 'low' would treat a
--    single noisy session as persistent. Institutional flows speak to the
--    treasury thesis, so weight slightly up; vocabulary stays descriptive —
--    no "conviction", "accumulation", "capitulation".
INSERT INTO finding_metric_config (metric_group, thesis_weight, vol_class, allowed_vocab, notes) VALUES
  ('etf_flows', 1.20, 'high', ARRAY['flows','inflows','outflows','net flow','allocation','participation']::TEXT[],
     'US spot ETF flows — institutional participation, the most-quoted evidence of it. High daily noise: '
     || 'single-session moves are watch-items, never verdicts.')
ON CONFLICT (metric_group) DO NOTHING;

-- ── Current flow streak ───────────────────────────────────────────────────────
-- The unbroken run of same-direction sessions ending at the latest observation,
-- and its total. Gaps-safe: it reads the rows that exist, so a weekend or market
-- holiday (no row) neither breaks nor extends a run. A genuine 0.00 session is
-- its own 'flat' run rather than a bridge between two same-signed runs.
CREATE OR REPLACE VIEW v_etf_flow_streak AS
WITH flows AS (
  SELECT observed_at, value, SIGN(value) AS dir
  FROM v_onchain_series
  WHERE key = 'etf_net_flow'
),
marked AS (
  SELECT observed_at, value, dir,
         CASE WHEN dir IS DISTINCT FROM LAG(dir) OVER (ORDER BY observed_at) THEN 1 ELSE 0 END AS starts_run
  FROM flows
),
grouped AS (
  SELECT observed_at, value, dir,
         SUM(starts_run) OVER (ORDER BY observed_at ROWS UNBOUNDED PRECEDING) AS run_id
  FROM marked
)
SELECT
  MAX(observed_at)  AS observed_at,
  COUNT(*)::INT     AS streak_sessions,
  CASE WHEN MIN(dir) > 0 THEN 'inflow'
       WHEN MAX(dir) < 0 THEN 'outflow'
       ELSE 'flat' END AS direction,
  SUM(value)        AS streak_total
FROM grouped
WHERE run_id = (SELECT MAX(run_id) FROM grouped)
GROUP BY run_id;

-- ── Dashboard: rebuilt from 20260710000000 with one added branch ──────────────
-- etf_net_flow and etf_net_assets need no branch — they are fetched + displayed,
-- so the first SELECT already picks them up. Only the derived streak does.
DROP VIEW IF EXISTS v_onchain_dashboard;

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
-- etf_flow_streak (derived): the current run of consecutive same-direction
-- sessions, summed. The chip states the run's length and direction — what it IS,
-- never what it implies.
SELECT
  'etf_flow_streak', 'US Spot ETF Flow Streak', 'ETF Flow Streak', 'etf_flows', 'usd_million', 2,
  ROUND(s.streak_total, 2),
  s.observed_at,
  NULL::numeric, NULL::numeric,
  (CURRENT_DATE - s.observed_at),
  (s.streak_sessions || CASE WHEN s.streak_sessions = 1 THEN ' session ' ELSE ' sessions ' END || s.direction)::text
FROM v_etf_flow_streak s
WHERE s.streak_total IS NOT NULL

UNION ALL
-- trend_valuation (derived from the BTC/USD close series)
SELECT
  key, name, short_label, metric_group, unit, decimals,
  value, observed_at, change_since_prior, pct_change_since_prior,
  days_since_observed, signal
FROM v_btc_trend_metrics;
