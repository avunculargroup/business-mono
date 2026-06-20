-- ============================================================
-- v_indicator_latest — with year-on-year
-- Replaces the YoY-free version in ../feature-spec.md (Database Views).
-- Run AFTER economic_indicators + indicator_observations exist.
-- ============================================================
--
-- WHY DROP + CREATE (not CREATE OR REPLACE):
--   CREATE OR REPLACE VIEW cannot reorder or insert columns mid-list —
--   it only appends at the end. We're slotting the YoY columns in beside
--   the other deltas, so we drop and recreate. Safe here: nothing depends
--   on this view (v_indicator_series is independent).
--
-- WHY A DATE JOIN, NOT "12 ROWS BACK":
--   "12 periods back" only works for monthly series with zero gaps, and
--   breaks outright for quarterly AU CPI (which needs 4). Instead we match
--   the observation exactly one CALENDAR year earlier:
--       yoy.period_date = latest.period_date - INTERVAL '1 year'
--   This is frequency-agnostic and gap-tolerant — and it only works
--   cleanly because every adapter normalises period_date to the FIRST day
--   of the period (see ../adapter-contract.md). 2026-05-01 → 2025-05-01;
--   2026-Q2 (stamped 2026-04-01) → 2025-04-01. No per-frequency branching.
--   If the year-ago period is missing (series < 1yr old, or a gap), the
--   join yields NULL — the card simply hides the YoY stat. That's correct,
--   not an error.
-- ============================================================

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
  -- Natural release frequency, computed from history — never stored.
  SELECT
    indicator_id,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap) AS median_release_gap_days
  FROM (
    SELECT
      indicator_id,
      (released_at - LAG(released_at) OVER (
        PARTITION BY indicator_id ORDER BY released_at
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

  latest.period_date,
  latest.value            AS current_value,
  latest.released_at,
  latest.is_revision,
  latest.superseded_value,

  -- ── Change since prior period ─────────────────────────
  prior.value             AS prior_value,
  (latest.value - prior.value)                            AS change_since_prior,
  CASE WHEN prior.value IS NOT NULL AND prior.value <> 0
       THEN ROUND(((latest.value - prior.value) / ABS(prior.value)) * 100, 2)
  END                                                     AS pct_change_since_prior,

  -- ── Year on year ──────────────────────────────────────
  yoy.value               AS year_ago_value,
  yoy.period_date         AS year_ago_period,
  -- Absolute change — the one to show for POLICY RATES (percentage points)
  (latest.value - yoy.value)                              AS yoy_change,
  -- Percent change — the one to show for INFLATION (= the inflation rate)
  -- and MONEY SUPPLY (= the money-growth / debasement rate)
  CASE WHEN yoy.value IS NOT NULL AND yoy.value <> 0
       THEN ROUND(((latest.value - yoy.value) / ABS(yoy.value)) * 100, 2)
  END                                                     AS yoy_pct_change,

  -- ── Freshness / cadence ───────────────────────────────
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

-- ============================================================
-- WHICH YoY COLUMN DOES THE CARD SHOW?  (by category)
-- ------------------------------------------------------------
--   policy_rate   → yoy_change       e.g. "0.50pp lower than a year ago"
--                   (percent-of-a-percent is meaningless for a rate)
--   inflation     → yoy_pct_change   this column *is* annual inflation
--   money_supply  → yoy_pct_change   the YoY money-growth rate — the
--                                     single most on-brand BTS number here
--
-- The view exposes both numbers; the component picks by `category`.
-- Keep that choice in the presentation layer, not baked into SQL —
-- the view stays a neutral source of facts.
--
-- NOTE ON VINTAGE: year_ago_value uses the CURRENT (most-revised) vintage,
-- consistent with how current_value is shown. Point-in-time YoY (the value
-- as it stood a year ago, pre-revision) is an ALFRED nicety — deferred.
-- ============================================================

-- Sanity check after seeding + a backfill:
--   SELECT short_label, category, current_value, yoy_change, yoy_pct_change
--   FROM v_indicator_latest;
