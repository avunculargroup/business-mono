-- ============================================================
-- ECONOMIC INDICATORS (macro series) — data layer
-- Spec: docs/features/economic-indicators/
--   feature-spec.md (data model, indexes, RLS, trigger, v_indicator_series)
--   sql/v_indicator_latest.sql (YoY-aware latest view — canonical)
--   sql/seed.sql (six v1 indicators)
--
-- Slow-moving macro indicators (money supply, inflation, policy rates)
-- persisted as a time series. Two tables: a source-discriminated registry
-- (economic_indicators) and an ingestion-agnostic observation series
-- (indicator_observations) with revision/supersession handling.
-- ============================================================


-- ── Registry: one row per tracked series ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS economic_indicators (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL,            -- e.g. 'US M2 Money Supply'
  short_label            TEXT NOT NULL,            -- compact card label, e.g. 'US M2'
  region                 TEXT NOT NULL
                         CHECK (region IN ('au','us','global')),
  category               TEXT NOT NULL
                         CHECK (category IN ('policy_rate','money_supply','inflation')),
  provider               TEXT NOT NULL
                         CHECK (provider IN ('fred','rba','abs')),
  provider_series_code   TEXT,                     -- FRED series_id, e.g. 'M2SL'
  provider_table_ref     TEXT,                     -- RBA/ABS table or dataflow ref, e.g. 'D3'
  unit                   TEXT NOT NULL,            -- 'percent','aud_billion','usd_billion','index'
  decimals               INT  NOT NULL DEFAULT 2,  -- display precision
  -- Operational poll cadence (how often we hit the API), NOT the data's natural
  -- frequency. The natural frequency is computed in v_indicator_latest, never stored.
  poll_frequency         TEXT NOT NULL DEFAULT 'daily'
                         CHECK (poll_frequency IN ('daily','weekly')),
  alert_on_new_print     BOOLEAN NOT NULL DEFAULT TRUE,
  alert_change_threshold NUMERIC,                  -- NULL = print-only; abs MoM change flags
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  notes                  TEXT,
  created_by             UUID REFERENCES team_members(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── Observation time series: one row per (indicator, period, vintage) ─────────
-- Append/supersede-only. No updated_at — rows are never edited in place, which
-- is what makes this a clean audit trail.
CREATE TABLE IF NOT EXISTS indicator_observations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id     UUID NOT NULL REFERENCES economic_indicators(id) ON DELETE CASCADE,
  -- Reference period, normalised to the FIRST day of the period (see adapter-contract.md).
  period_date      DATE NOT NULL,
  value            NUMERIC(18,4) NOT NULL,
  -- When the PROVIDER published this value — distinct from period_date.
  -- v1: providers don't expose it, so the workflow substitutes the fetch date.
  released_at      DATE NOT NULL,
  is_current       BOOLEAN NOT NULL DEFAULT TRUE,   -- latest vintage of this period
  is_revision      BOOLEAN NOT NULL DEFAULT FALSE,  -- supersedes an earlier value for this period
  superseded_value NUMERIC(18,4),                   -- the prior value this revision replaced
  source           TEXT NOT NULL
                   CHECK (source IN ('fred','rba','abs','manual')),
  raw              JSONB NOT NULL DEFAULT '{}'::jsonb,  -- provider payload slice, for re-parse
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()   -- when WE ingested it
);


-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_indicator_obs_indicator
  ON indicator_observations(indicator_id);
CREATE INDEX IF NOT EXISTS idx_indicator_obs_period
  ON indicator_observations(indicator_id, period_date DESC);
CREATE INDEX IF NOT EXISTS idx_indicator_obs_current
  ON indicator_observations(indicator_id, is_current) WHERE is_current = true;
-- Multiple vintages of one period coexist; uniqueness is on the vintage triple.
CREATE UNIQUE INDEX IF NOT EXISTS uq_indicator_obs_vintage
  ON indicator_observations(indicator_id, period_date, released_at);

CREATE INDEX IF NOT EXISTS idx_economic_indicators_region
  ON economic_indicators(region);
CREATE INDEX IF NOT EXISTS idx_economic_indicators_active
  ON economic_indicators(is_active) WHERE is_active = true;


-- ── updated_at trigger (reuses the existing shared function) ──────────────────
DROP TRIGGER IF EXISTS economic_indicators_updated_at ON economic_indicators;
CREATE TRIGGER economic_indicators_updated_at
  BEFORE UPDATE ON economic_indicators
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── Row level security ────────────────────────────────────────────────────────
-- Agents poll/write via service_role; team members read/write via authenticated.
ALTER TABLE economic_indicators    ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicator_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "economic_indicators_all" ON economic_indicators;
CREATE POLICY "economic_indicators_all" ON economic_indicators
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

DROP POLICY IF EXISTS "indicator_observations_all" ON indicator_observations;
CREATE POLICY "indicator_observations_all" ON indicator_observations
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));


-- ============================================================
-- VIEWS
-- ============================================================

-- ── v_indicator_series — thin helper for sparklines and Rex ───────────────────
-- Current-vintage observations for an indicator, oldest→newest.
DROP VIEW IF EXISTS v_indicator_series;
CREATE VIEW v_indicator_series AS
  SELECT
    o.indicator_id,
    i.short_label,
    o.period_date,
    o.value,
    o.released_at
  FROM indicator_observations o
  JOIN economic_indicators i ON i.id = o.indicator_id
  WHERE o.is_current = true
  ORDER BY o.indicator_id, o.period_date ASC;


-- ── v_indicator_latest — current value + computed deltas + computed cadence ───
-- Canonical YoY-aware definition from sql/v_indicator_latest.sql. Nothing here
-- is stored. YoY uses a calendar-year date join (frequency-agnostic, gap-tolerant)
-- which only works because every adapter normalises period_date to first-of-period.
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
-- SEED — six v1 indicators (sql/seed.sql)
-- ============================================================
-- FRED series codes (FEDFUNDS, M2SL, CPIAUCSL) are stable. RBA table refs
-- (F1.1, D3) are stable but the adapter's target COLUMN HEADER must be confirmed
-- against the live CSV at build (Session 2). AU CPI (ABS) is seeded inactive —
-- its adapter isn't built yet. created_by left NULL.
--
-- Idempotent: each row is inserted only if its name is not already present.

INSERT INTO economic_indicators
  (name, short_label, region, category, provider,
   provider_series_code, provider_table_ref,
   unit, decimals, poll_frequency,
   alert_on_new_print, alert_change_threshold, is_active, notes)
SELECT v.name, v.short_label, v.region, v.category, v.provider,
       v.provider_series_code, v.provider_table_ref,
       v.unit, v.decimals, v.poll_frequency,
       v.alert_on_new_print, v.alert_change_threshold, v.is_active, v.notes
FROM (VALUES
  -- 1. RBA cash rate target
  ( 'RBA Cash Rate Target', 'RBA Cash Rate', 'au', 'policy_rate', 'rba',
    NULL, 'F1.1',
    'percent', 2, 'daily',
    true, NULL::numeric, true,
    'RBA table F1.1 (Interest Rates & Yields – Money Market). Confirm the '
    || 'cash-rate-target column header against the live CSV. Daily poll so a '
    || 'decision is caught same day; it no-ops between the ~8 meetings/yr. '
    || 'A HOLD will not create a new observation under the revision rules.' ),

  -- 2. US Fed funds rate
  ( 'US Federal Funds Rate', 'Fed Funds', 'us', 'policy_rate', 'fred',
    'FEDFUNDS', NULL,
    'percent', 2, 'daily',
    true, NULL, true,
    'FEDFUNDS = monthly average effective rate. To track the policy TARGET '
    || 'RANGE instead (changes on the FOMC date), switch to DFEDTARU (upper '
    || 'bound, daily). Pick one — do not seed both.' ),

  -- 3. US M2 money supply
  ( 'US M2 Money Supply', 'US M2', 'us', 'money_supply', 'fred',
    'M2SL', NULL,
    'usd_billion', 1, 'weekly',
    true, NULL, true,
    'M2SL = seasonally adjusted, monthly, USD billions. Weekly poll is ample '
    || 'for monthly data. M2REAL exists for the inflation-adjusted cut, but the '
    || 'nominal line is the debasement chart.' ),

  -- 4. AU broad money
  ( 'AU Broad Money', 'AU Broad Money', 'au', 'money_supply', 'rba',
    NULL, 'D3',
    'aud_billion', 1, 'weekly',
    true, NULL, true,
    'RBA table D3 (Monetary Aggregates). D3 carries M1, M3, Broad money and '
    || 'Money base — seed targets the "Broad money" (seasonally adjusted) '
    || 'column; confirm the exact header at build. FRED mirror MABMM301AUM189S '
    || 'is a fallback (provider would then become fred).' ),

  -- 5. US CPI
  ( 'US CPI (All Items)', 'US CPI', 'us', 'inflation', 'fred',
    'CPIAUCSL', NULL,
    'index', 1, 'weekly',
    true, NULL, true,
    'CPIAUCSL = All Urban Consumers, All Items, SA, index (1982–84=100). Store '
    || 'the index level and compute YoY inflation % in the view. BLS headlines '
    || 'the 12-month change off the NSA series (CPIAUCNS) — only switch to match '
    || 'the headline number exactly.' ),

  -- 6. AU CPI (DEFERRED — seeded but inactive)
  ( 'AU CPI (All Groups)', 'AU CPI', 'au', 'inflation', 'abs',
    NULL, 'CPI',
    'index', 1, 'weekly',
    true, NULL, false,                       -- is_active = false: not polled yet
    'DEFERRED per spec — ABS adapter not built. provider_table_ref "CPI" is the '
    || 'best-guess Data API dataflow for the quarterly All-Groups, eight-capital '
    || 'weighted-average index; CONFIRM against the live ABS SDMX endpoint. '
    || 'Alternatives: ABS monthly CPI indicator dataflow, or FRED OECD mirror '
    || 'AUSCPIALLQINMEI (quarterly). Flip is_active to true once an adapter exists.' )
) AS v(name, short_label, region, category, provider,
       provider_series_code, provider_table_ref,
       unit, decimals, poll_frequency,
       alert_on_new_print, alert_change_threshold, is_active, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM economic_indicators e WHERE e.name = v.name
);
