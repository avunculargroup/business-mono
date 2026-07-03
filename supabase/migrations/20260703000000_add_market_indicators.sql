-- ── Economic indicators: daily-granularity market series (DXY, gold, S&P, 10Y) ──
-- The macro system was built for slow monthly series: adapters normalise every
-- observation to the FIRST of the month and the poll's revision rules key on
-- period_date. That is correct for policy rates / money supply / inflation, but it
-- would collapse a DAILY market series onto one first-of-month period and supersede
-- it every poll — retaining only the latest value per month and losing the daily
-- history. This migration generalises the registry to carry a natural
-- period_granularity, so daily series keep the actual day (see
-- apps/agents/src/lib/indicators/period.ts toISODateUTC + the FRED adapter), and
-- seeds four daily market series the founders want in the daily report.

-- 1. Natural reference period of the series (NOT the operational poll cadence).
--    Default 'monthly' preserves every existing row's behaviour.
ALTER TABLE economic_indicators
  ADD COLUMN IF NOT EXISTS period_granularity TEXT NOT NULL DEFAULT 'monthly'
    CHECK (period_granularity IN ('daily','monthly','quarterly'));

-- 2. Market categories on the registry. Extends the enum (already grown once for
--    'activity') — same DROP/ADD pattern.
ALTER TABLE economic_indicators DROP CONSTRAINT IF EXISTS economic_indicators_category_check;
ALTER TABLE economic_indicators
  ADD CONSTRAINT economic_indicators_category_check
  CHECK (category IN ('policy_rate','money_supply','inflation','activity',
                      'fx','commodity','equity','bond_yield'));

-- 3. Expose period_granularity on v_indicator_latest so the web card can format
--    the "as at" date by day vs month. Same body as the canonical view plus one
--    column (see 20260620000000_add_economic_indicators.sql).
DROP VIEW IF EXISTS v_indicator_latest;
CREATE VIEW v_indicator_latest AS
WITH current_obs AS (
  SELECT
    o.indicator_id,
    o.period_date,
    o.value,
    o.released_at,
    o.is_revision,
    o.superseded_value
  FROM indicator_observations o
  WHERE o.is_current = true
),
ranked AS (
  SELECT
    co.*,
    ROW_NUMBER() OVER (
      PARTITION BY co.indicator_id ORDER BY co.period_date DESC
    ) AS rn
  FROM current_obs co
),
cadence AS (
  SELECT
    indicator_id,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap) AS median_release_gap_days
  FROM (
    SELECT
      indicator_id,
      (released_at - LAG(released_at) OVER (
        PARTITION BY indicator_id ORDER BY released_at
      ))::double precision AS gap
    FROM current_obs
  ) g
  WHERE gap IS NOT NULL
  GROUP BY indicator_id
)
SELECT
  i.id            AS indicator_id,
  i.name,
  i.short_label,
  i.region,
  i.category,
  i.unit,
  i.decimals,
  i.period_granularity,

  latest.period_date,
  latest.value            AS current_value,
  latest.released_at,
  latest.is_revision,
  latest.superseded_value,

  prior.value             AS prior_value,
  (latest.value - prior.value)                            AS change_since_prior,
  CASE WHEN prior.value IS NOT NULL AND prior.value <> 0
       THEN ROUND(((latest.value - prior.value) / ABS(prior.value)) * 100, 2)
  END                                                     AS pct_change_since_prior,

  yoy.value               AS year_ago_value,
  yoy.period_date         AS year_ago_period,
  (latest.value - yoy.value)                              AS yoy_change,
  CASE WHEN yoy.value IS NOT NULL AND yoy.value <> 0
       THEN ROUND(((latest.value - yoy.value) / ABS(yoy.value)) * 100, 2)
  END                                                     AS yoy_pct_change,

  (CURRENT_DATE - latest.released_at)                     AS days_since_release,
  ROUND(c.median_release_gap_days)                        AS typical_release_gap_days,
  (latest.released_at + ROUND(c.median_release_gap_days)::int)
                                                          AS expected_next_release

FROM economic_indicators i
LEFT JOIN ranked latest
       ON latest.indicator_id = i.id AND latest.rn = 1
LEFT JOIN ranked prior
       ON prior.indicator_id  = i.id AND prior.rn = 2
LEFT JOIN current_obs yoy
       ON yoy.indicator_id = i.id
      AND yoy.period_date  = (latest.period_date - INTERVAL '1 year')::date
LEFT JOIN cadence c
       ON c.indicator_id = i.id
WHERE i.is_active = true
ORDER BY i.region, i.category;

-- 4. Seed the four daily market series. All FRED, all daily; alert_on_new_print is
--    FALSE with a NULL threshold so they never spawn content beats (they exist for
--    the daily report and pattern history, not for drafting). Idempotent on name.
INSERT INTO economic_indicators
  (name, short_label, region, category, provider,
   provider_series_code, provider_table_ref,
   unit, decimals, poll_frequency, period_granularity,
   alert_on_new_print, alert_change_threshold, is_active, notes)
SELECT v.name, v.short_label, v.region, v.category, v.provider,
       v.provider_series_code, v.provider_table_ref,
       v.unit, v.decimals, v.poll_frequency, v.period_granularity,
       v.alert_on_new_print, v.alert_change_threshold, v.is_active, v.notes
FROM (VALUES
  -- US dollar index. NB: the classic ICE DXY is proprietary and not on FRED; this
  -- is the Fed's Nominal Broad U.S. Dollar Index (trade-weighted), the free proxy.
  ( 'US Dollar Index (broad)', 'DXY', 'global', 'fx', 'fred',
    'DTWEXBGS', NULL,
    'index', 2, 'daily', 'daily',
    false, NULL::numeric, true,
    'FRED DTWEXBGS = Nominal Broad U.S. Dollar Index (trade-weighted, daily). The '
    || 'classic ICE US Dollar Index (DXY) is proprietary and not on FRED''s free '
    || 'tier — this broad TWI is the free stand-in; the two move together but are '
    || 'not identical. Daily series: stored per business day via period_granularity.' ),

  -- Gold, USD per troy ounce.
  ( 'Gold (USD/oz)', 'Gold', 'global', 'commodity', 'fred',
    'GOLDAMGBD228NLBM', NULL,
    'usd', 2, 'daily', 'daily',
    false, NULL, true,
    'FRED GOLDAMGBD228NLBM = LBMA Gold Price, 10:30am London fixing, USD per troy '
    || 'ounce, daily (business days). Occasional holiday gaps are expected.' ),

  -- S&P 500 index level.
  ( 'S&P 500', 'S&P 500', 'us', 'equity', 'fred',
    'SP500', NULL,
    'index', 2, 'daily', 'daily',
    false, NULL, true,
    'FRED SP500 = S&P 500 index level, daily. FRED''s free series carries ~10 years '
    || 'of history (licensing limit), which is ample for the report and sparkline.' ),

  -- US 10-year Treasury yield.
  ( 'US 10Y Treasury Yield', 'US 10Y', 'us', 'bond_yield', 'fred',
    'DGS10', NULL,
    'percent', 2, 'daily', 'daily',
    false, NULL, true,
    'FRED DGS10 = 10-Year Treasury Constant Maturity Rate, percent, daily (business '
    || 'days). The risk-free anchor / real-rate reference for the macro report.' )
) AS v(name, short_label, region, category, provider,
       provider_series_code, provider_table_ref,
       unit, decimals, poll_frequency, period_granularity,
       alert_on_new_print, alert_change_threshold, is_active, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM economic_indicators e WHERE e.name = v.name
);
