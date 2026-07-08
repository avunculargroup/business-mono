-- ── Trend & Valuation: price-derived Bitcoin metrics ─────────────────────────
-- Adds a new metric_group 'trend_valuation' whose members are computed from a
-- single daily BTC/USD CLOSE series: 200/50-day moving averages, the 200-week
-- moving average, the Mayer Multiple (price ÷ 200d MA), a 50d-vs-200d cross
-- state, RSI(14), 30-day annualised realised volatility, and drawdown from the
-- observed high.
--
-- SAME PATTERN as Hash Ribbons (20260621170000): the close series is the ONLY
-- new stored input; every trend metric is DERIVED in a view, never stored. The
-- close comes from Coin Metrics PriceUSD (free, keyless, community tier, deep
-- history) via the existing coinmetrics adapter, which already batches every CM
-- metric into one request — so runOnchainPoll needs no change to pick it up.
--
-- USD, not AUD: the 200-week MA and Mayer Multiple are conventionally quoted in
-- USD and PriceUSD gives the full history the 200-week window needs. The existing
-- btc_price_aud snapshot card (market_snapshot group) is unaffected.
--
-- COMPLIANCE: valuation/trend framing is the platform's highest advice-risk
-- surface. These rows are DISPLAY-ONLY — no alert_config, so they never propose a
-- content beat. The 50d/200d cross state is labelled neutrally (above/below/
-- crossed) — it states what the relationship IS, never a buy/sell implication.

-- 1. New metric group.
ALTER TABLE onchain_indicators DROP CONSTRAINT IF EXISTS onchain_indicators_metric_group_check;
ALTER TABLE onchain_indicators
  ADD CONSTRAINT onchain_indicators_metric_group_check
  CHECK (metric_group IN ('network_security','behaviour_valuation','market_snapshot','trend_valuation'));

-- 2. Seed the raw input (BTC/USD daily close) + 8 derived display metrics.
--    Idempotent on key. btc_price_usd is is_displayed=false (a raw input that
--    feeds the derived rows; the AUD price already has a snapshot card). All
--    derived rows carry provider=NULL, empty alert_config, and a derivation_spec
--    documenting the formula the view implements.
INSERT INTO onchain_indicators
  (key, name, short_label, metric_group, derivation, provider,
   provider_metric_code, derivation_spec, unit, decimals,
   poll_frequency, is_displayed, alert_config, is_active, notes)
SELECT v.key, v.name, v.short_label, v.metric_group, v.derivation, v.provider,
       v.provider_metric_code, v.derivation_spec::jsonb, v.unit, v.decimals,
       v.poll_frequency, v.is_displayed, v.alert_config::jsonb, v.is_active, v.notes
FROM (VALUES

  -- ── RAW INPUT — BTC/USD daily close (not displayed) ──────────
  ( 'btc_price_usd', 'Bitcoin Price (USD close)', 'BTC/USD', 'trend_valuation', 'fetched', 'coinmetrics',
    'PriceUSD', '{}', 'usd', 0,
    'daily', false, '{}', true,
    'CM PriceUSD, daily close. Feeds every trend_valuation metric. Backfilled deep (see onchain_poll backfill_days) so the 200-week window and drawdown high are meaningful from day one.' ),

  -- ── DERIVED display metrics ──────────────────────────────────
  ( 'ma_50d', 'Fifty-Day Moving Average', '50-Day MA', 'trend_valuation', 'derived', NULL,
    NULL, '{"type":"sma","source_key":"btc_price_usd","window_days":50}', 'usd', 0,
    'daily', true, '{}', true,
    'DERIVED in v_btc_trend = mean of the last 50 daily closes. Emits once 50 days exist.' ),

  ( 'ma_200d', 'Two-Hundred-Day Moving Average', '200-Day MA', 'trend_valuation', 'derived', NULL,
    NULL, '{"type":"sma","source_key":"btc_price_usd","window_days":200}', 'usd', 0,
    'daily', true, '{}', true,
    'DERIVED in v_btc_trend = mean of the last 200 daily closes. Emits once 200 days exist.' ),

  ( 'ma_200w', 'Two-Hundred-Week Moving Average', '200-Week MA', 'trend_valuation', 'derived', NULL,
    NULL, '{"type":"sma","source_key":"btc_price_usd","window_days":1400,"note":"1400-day SMA approximates the 200-week SMA"}', 'usd', 0,
    'daily', true, '{}', true,
    'DERIVED in v_btc_trend = mean of the last 1400 daily closes (a 1400-day SMA, the standard proxy for the 200-week SMA). Emits once 1400 days exist.' ),

  ( 'mayer_multiple', 'Mayer Multiple', 'Mayer Multiple', 'trend_valuation', 'derived', NULL,
    NULL, '{"type":"ratio","numerator_key":"btc_price_usd","denominator":"ma_200d"}', 'ratio', 2,
    'daily', true, '{}', true,
    'DERIVED in v_btc_trend = close ÷ 200-day MA. Illustrative valuation context, NOT advice. Emits once 200 days exist.' ),

  ( 'ma_cross', 'Fifty vs Two-Hundred-Day MA', '50d vs 200d', 'trend_valuation', 'derived', NULL,
    NULL, '{"type":"cross","fast":"ma_50d","slow":"ma_200d","note":"golden/death-cross relationship, framed neutrally"}', 'signal', 2,
    'daily', true, '{}', true,
    'DERIVED in v_btc_trend. Value is the 50d/200d spread %; signal states whether the 50d is above/below the 200d, or crossed this poll. Neutral framing — states what the relationship IS, never a buy/sell call.' ),

  ( 'rsi_14', 'Relative Strength Index (14-day)', 'RSI (14d)', 'trend_valuation', 'derived', NULL,
    NULL, '{"type":"rsi","source_key":"btc_price_usd","window_days":14,"method":"cutler_sma"}', 'index', 0,
    'daily', true, '{}', true,
    'DERIVED in v_btc_trend. Cutler''s RSI (simple averages of 14-day gains/losses). Momentum context only. Emits once 15 closes exist.' ),

  ( 'realized_vol_30d', 'Realised Volatility (30-day, annualised)', 'Volatility (30d)', 'trend_valuation', 'derived', NULL,
    NULL, '{"type":"volatility","source_key":"btc_price_usd","window_days":30,"annualisation":365}', 'percent', 1,
    'daily', true, '{}', true,
    'DERIVED in v_btc_trend = sample stddev of 30 daily log returns × √365 × 100. Emits once 30 returns exist.' ),

  ( 'drawdown_from_high', 'Drawdown from High', 'Drawdown', 'trend_valuation', 'derived', NULL,
    NULL, '{"type":"drawdown","source_key":"btc_price_usd","reference":"running_max"}', 'percent', 1,
    'daily', true, '{}', true,
    'DERIVED in v_btc_trend = (close − observed running high) ÷ running high × 100. Zero or negative. High is the max over the observed (backfilled) window.' )

) AS v(key, name, short_label, metric_group, derivation, provider,
       provider_metric_code, derivation_spec, unit, decimals,
       poll_frequency, is_displayed, alert_config, is_active, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM onchain_indicators e WHERE e.key = v.key
);

-- 3. Deepen the poll's backfill so the 200-week window (1400 days) and the
--    drawdown high are populated on first ingest, and reach the 2021 cycle high.
--    ~2600 days ≈ 7 years. One-time large fetch for the whole coinmetrics group;
--    point-in-time mempool endpoints ignore backfill_days. Idempotent-safe: only
--    bumps a value below 2600.
UPDATE routines
SET action_config = jsonb_set(action_config, '{backfill_days}', '2600'::jsonb)
WHERE action_type = 'onchain_poll'
  AND COALESCE((action_config->>'backfill_days')::int, 0) < 2600;

-- ============================================================
-- VIEWS
-- v_onchain_dashboard depends on v_hash_ribbons and (now) v_btc_trend_metrics,
-- so drop dashboard first, (re)create the trend views, then rebuild dashboard.
-- v_hash_ribbons and v_onchain_series are untouched.
--
-- CAVEAT (window = ROWS, not calendar days): like v_hash_ribbons, the windows
-- below count ROWS via ROWS BETWEEN N PRECEDING. Correct only if btc_price_usd
-- has one contiguous row per day; a polling gap shortens the effective window.
-- Fine for reliable daily polling.
-- ============================================================

DROP VIEW IF EXISTS v_onchain_dashboard;
DROP VIEW IF EXISTS v_btc_trend_metrics;
DROP VIEW IF EXISTS v_btc_trend;

-- ── Per-day trend metrics computed from the BTC/USD close series ──────────────
CREATE VIEW v_btc_trend AS
WITH px AS (
  SELECT o.observed_at, o.value AS close
  FROM onchain_observations o
  JOIN onchain_indicators i ON i.id = o.indicator_id
  WHERE i.key = 'btc_price_usd' AND o.is_current = true
),
base AS (
  SELECT
    observed_at,
    close,
    AVG(close) OVER w50   AS ma_50d,
    COUNT(*)   OVER w50   AS n50,
    AVG(close) OVER w200  AS ma_200d,
    COUNT(*)   OVER w200  AS n200,
    AVG(close) OVER w200w AS ma_200w,
    COUNT(*)   OVER w200w AS n200w,
    MAX(close) OVER (ORDER BY observed_at ROWS UNBOUNDED PRECEDING) AS running_high,
    LN(close / NULLIF(LAG(close) OVER (ORDER BY observed_at), 0))   AS log_ret,
    GREATEST(close - LAG(close) OVER (ORDER BY observed_at), 0)     AS gain,
    GREATEST(LAG(close) OVER (ORDER BY observed_at) - close, 0)     AS loss
  FROM px
  WINDOW
    w50   AS (ORDER BY observed_at ROWS BETWEEN 49   PRECEDING AND CURRENT ROW),
    w200  AS (ORDER BY observed_at ROWS BETWEEN 199  PRECEDING AND CURRENT ROW),
    w200w AS (ORDER BY observed_at ROWS BETWEEN 1399 PRECEDING AND CURRENT ROW)
),
smoothed AS (
  SELECT
    base.*,
    STDDEV_SAMP(log_ret) OVER w30 AS sd30,
    COUNT(log_ret)       OVER w30 AS nret30,
    AVG(gain) OVER w14 AS avg_gain,
    AVG(loss) OVER w14 AS avg_loss,
    COUNT(gain) OVER w14 AS nchg
  FROM base
  WINDOW
    w30 AS (ORDER BY observed_at ROWS BETWEEN 29 PRECEDING AND CURRENT ROW),
    w14 AS (ORDER BY observed_at ROWS BETWEEN 13 PRECEDING AND CURRENT ROW)
)
SELECT
  observed_at,
  close,
  CASE WHEN n50   >= 50   THEN ma_50d  END AS ma_50d,
  CASE WHEN n200  >= 200  THEN ma_200d END AS ma_200d,
  CASE WHEN n200w >= 1400 THEN ma_200w END AS ma_200w,
  CASE WHEN n200  >= 200  THEN close / NULLIF(ma_200d, 0) END AS mayer_multiple,
  CASE WHEN n50 >= 50 AND n200 >= 200
       THEN ((ma_50d / NULLIF(ma_200d, 0)) - 1) * 100 END           AS ma_cross_spread_pct,
  CASE WHEN n50 >= 50 AND n200 >= 200
       THEN CASE WHEN ma_50d >= ma_200d THEN 1 ELSE 0 END END        AS above_200d,
  CASE WHEN nret30 >= 30 THEN sd30 * SQRT(365) * 100 END             AS realized_vol_30d,
  CASE
    WHEN nchg >= 14 AND avg_loss > 0 THEN 100 - (100 / (1 + (avg_gain / avg_loss)))
    WHEN nchg >= 14 AND avg_loss = 0 AND avg_gain > 0 THEN 100
    WHEN nchg >= 14 AND avg_loss = 0 AND avg_gain = 0 THEN 50
  END                                                                AS rsi_14,
  CASE WHEN running_high > 0 THEN ((close - running_high) / running_high) * 100 END AS drawdown_pct
FROM smoothed
ORDER BY observed_at;

-- ── Latest trend metrics, one row each, shaped like v_onchain_dashboard ───────
-- Deltas compare the latest observed day to the prior day. The cross signal is
-- derived from the above/below transition between those two days.
CREATE VIEW v_btc_trend_metrics AS
WITH latest AS (SELECT * FROM v_btc_trend ORDER BY observed_at DESC LIMIT 1),
     prior  AS (SELECT * FROM v_btc_trend ORDER BY observed_at DESC OFFSET 1 LIMIT 1),
     lp AS (
       SELECT
         l.observed_at,
         l.ma_50d,   p.ma_50d   AS p_ma_50d,
         l.ma_200d,  p.ma_200d  AS p_ma_200d,
         l.ma_200w,  p.ma_200w  AS p_ma_200w,
         l.mayer_multiple, p.mayer_multiple AS p_mayer,
         l.ma_cross_spread_pct, l.above_200d, p.above_200d AS p_above,
         l.realized_vol_30d, p.realized_vol_30d AS p_vol,
         l.rsi_14, p.rsi_14 AS p_rsi,
         l.drawdown_pct
       FROM latest l LEFT JOIN prior p ON true
     )
SELECT 'ma_50d'::text AS key, 'Fifty-Day Moving Average'::text AS name, '50-Day MA'::text AS short_label,
       'trend_valuation'::text AS metric_group, 'usd'::text AS unit, 0 AS decimals,
       ROUND(ma_50d, 0) AS value, observed_at,
       ROUND(ma_50d - p_ma_50d, 0) AS change_since_prior,
       CASE WHEN p_ma_50d IS NOT NULL AND p_ma_50d <> 0
            THEN ROUND(((ma_50d - p_ma_50d) / ABS(p_ma_50d)) * 100, 2) END AS pct_change_since_prior,
       (CURRENT_DATE - observed_at) AS days_since_observed, NULL::text AS signal
FROM lp WHERE ma_50d IS NOT NULL
UNION ALL
SELECT 'ma_200d', 'Two-Hundred-Day Moving Average', '200-Day MA',
       'trend_valuation', 'usd', 0,
       ROUND(ma_200d, 0), observed_at,
       ROUND(ma_200d - p_ma_200d, 0),
       CASE WHEN p_ma_200d IS NOT NULL AND p_ma_200d <> 0
            THEN ROUND(((ma_200d - p_ma_200d) / ABS(p_ma_200d)) * 100, 2) END,
       (CURRENT_DATE - observed_at), NULL::text
FROM lp WHERE ma_200d IS NOT NULL
UNION ALL
SELECT 'ma_200w', 'Two-Hundred-Week Moving Average', '200-Week MA',
       'trend_valuation', 'usd', 0,
       ROUND(ma_200w, 0), observed_at,
       ROUND(ma_200w - p_ma_200w, 0),
       CASE WHEN p_ma_200w IS NOT NULL AND p_ma_200w <> 0
            THEN ROUND(((ma_200w - p_ma_200w) / ABS(p_ma_200w)) * 100, 2) END,
       (CURRENT_DATE - observed_at), NULL::text
FROM lp WHERE ma_200w IS NOT NULL
UNION ALL
SELECT 'mayer_multiple', 'Mayer Multiple', 'Mayer Multiple',
       'trend_valuation', 'ratio', 2,
       ROUND(mayer_multiple, 2), observed_at,
       ROUND(mayer_multiple - p_mayer, 2),
       CASE WHEN p_mayer IS NOT NULL AND p_mayer <> 0
            THEN ROUND(((mayer_multiple - p_mayer) / ABS(p_mayer)) * 100, 2) END,
       (CURRENT_DATE - observed_at), NULL::text
FROM lp WHERE mayer_multiple IS NOT NULL
UNION ALL
SELECT 'ma_cross', 'Fifty vs Two-Hundred-Day MA', '50d vs 200d',
       'trend_valuation', 'signal', 2,
       ROUND(ma_cross_spread_pct, 2), observed_at,
       NULL::numeric, NULL::numeric,
       (CURRENT_DATE - observed_at),
       CASE
         WHEN above_200d = 1 AND p_above = 0 THEN 'cross_up'
         WHEN above_200d = 0 AND p_above = 1 THEN 'cross_down'
         WHEN above_200d = 1 THEN 'above'
         ELSE 'below'
       END
FROM lp WHERE ma_cross_spread_pct IS NOT NULL
UNION ALL
SELECT 'rsi_14', 'Relative Strength Index (14-day)', 'RSI (14d)',
       'trend_valuation', 'index', 0,
       ROUND(rsi_14, 0), observed_at,
       ROUND(rsi_14 - p_rsi, 0),
       CASE WHEN p_rsi IS NOT NULL AND p_rsi <> 0
            THEN ROUND(((rsi_14 - p_rsi) / ABS(p_rsi)) * 100, 2) END,
       (CURRENT_DATE - observed_at), NULL::text
FROM lp WHERE rsi_14 IS NOT NULL
UNION ALL
SELECT 'realized_vol_30d', 'Realised Volatility (30-day, annualised)', 'Volatility (30d)',
       'trend_valuation', 'percent', 1,
       ROUND(realized_vol_30d, 1), observed_at,
       ROUND(realized_vol_30d - p_vol, 1),
       CASE WHEN p_vol IS NOT NULL AND p_vol <> 0
            THEN ROUND(((realized_vol_30d - p_vol) / ABS(p_vol)) * 100, 2) END,
       (CURRENT_DATE - observed_at), NULL::text
FROM lp WHERE realized_vol_30d IS NOT NULL
UNION ALL
SELECT 'drawdown_from_high', 'Drawdown from High', 'Drawdown',
       'trend_valuation', 'percent', 1,
       ROUND(drawdown_pct, 1), observed_at,
       NULL::numeric, NULL::numeric,
       (CURRENT_DATE - observed_at), NULL::text
FROM lp WHERE drawdown_pct IS NOT NULL;

-- ── Dashboard: one row per DISPLAY metric (fetched + derived + trend) ─────────
-- Rebuilt verbatim from 20260621170000 with the trend_valuation rows unioned in.
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
