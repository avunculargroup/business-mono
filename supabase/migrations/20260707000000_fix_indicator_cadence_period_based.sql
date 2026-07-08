-- ── Fix: "next release" cadence must derive from period spacing, not released_at ──
-- v_indicator_latest computed expected_next_release as
--   released_at + median(gap between successive released_at values).
-- But v1 adapters supply no publication date, so runIndicatorPoll substitutes the
-- FETCH date for released_at (see runIndicatorPoll.ts + indicator_observations
-- comment). A first-ingest backfill therefore writes its whole history with ONE
-- released_at, so every release gap is 0, the median is 0, and
--   expected_next_release = released_at + 0 = released_at.
-- The card then shows "released 1 July · next release ~ 1 July" — a next release
-- on the day it was released, already in the past. (Even after steady polling the
-- backfill's many 0-gaps dominate the median, so this never self-corrects.)
--
-- period_date, by contrast, IS reliable: every adapter normalises each observation
-- to the first day of its period (a hard convention), so the gaps between periods
-- are the series' true publication cadence — ~30/31d monthly, ~91d quarterly, ~1d
-- daily. Compute the cadence from period_date instead. Everything else about the
-- view is unchanged (body copied from 20260703000000_add_market_indicators.sql).

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
  -- Natural release frequency, computed from the spacing of PERIODS (not vintages).
  -- released_at is the fetch date in v1, so a backfill shares one value and its
  -- release gaps are all 0; period_date is normalised per period and gives the
  -- real cadence. Never stored.
  SELECT
    indicator_id,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap) AS median_release_gap_days
  FROM (
    SELECT
      indicator_id,
      (period_date - LAG(period_date) OVER (
        PARTITION BY indicator_id ORDER BY period_date
      ))::double precision AS gap          -- cast keeps percentile_cont happy
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
