-- ── Economic indicators: six AU series, seeded inactive ──────────────────────
--
-- Spec: docs/features/economic-indicators/abs-activation-spec.md
--
-- Same pattern as the June seed: each row exists with a best-guess ref and
-- is_active = false, so turning one on is a deliberate, verified step
-- (docs/features/economic-indicators/activating-an-indicator.md).
--
-- The ABS refs carry no data key yet. On a first run the adapter asks for
-- every series in the dataflow, the parser refuses the multi-series answer,
-- and the failure note lists the series keys the data key is written from.
--
-- Monthly ABS series poll daily, not weekly: weekly means Mondays only, and
-- monthly CPI lands on the last Wednesday of the month.

INSERT INTO economic_indicators
  (name, short_label, region, category, provider,
   provider_series_code, provider_table_ref,
   unit, decimals, poll_frequency, period_granularity,
   alert_on_new_print, is_active, notes)
SELECT v.name, v.short_label, v.region, v.category, v.provider,
       NULL, v.provider_table_ref,
       v.unit, v.decimals, v.poll_frequency, v.period_granularity,
       v.alert_on_new_print, false, v.notes
FROM (VALUES
  ( 'AU Trimmed Mean CPI (annual %)', 'AU Trimmed Mean', 'au', 'inflation', 'abs',
    'ABS,CPI,2.0.0', 'percent', 1, 'daily', 'monthly', true,
    'Monthly CPI analytical series, trimmed mean, % change from corresponding month '
    || 'of previous year, SA. Data key to be written from the first live response. '
    || 'Stored as a rate: ABS does not publish a trimmed-mean index.' ),

  ( 'AU Unemployment Rate', 'AU Unemployment', 'au', 'labour', 'abs',
    'ABS,LF', 'percent', 1, 'daily', 'monthly', true,
    'Labour Force, Australia. Unemployment rate, persons, seasonally adjusted. '
    || 'Dataflow id and version unconfirmed; check explore.abs.gov.au.' ),

  ( 'AU Wage Price Index', 'AU WPI', 'au', 'labour', 'abs',
    'ABS,WPI', 'index', 1, 'weekly', 'quarterly', true,
    'Total hourly rates of pay excluding bonuses, all sectors, Australia, original. '
    || 'Dataflow id and version unconfirmed.' ),

  ( 'AU Total Credit', 'AU Credit', 'au', 'credit', 'rba',
    'D2', 'aud_billion', 1, 'weekly', 'monthly', true,
    'RBA D2 Lending and credit aggregates, total credit, SA level. Column Series ID '
    || 'to confirm against the live CSV. Growth comes from '
    || 'v_indicator_latest.yoy_pct_change.' ),

  ( 'RBA Index of Commodity Prices (AUD)', 'AU Commodity Prices', 'au', 'commodity', 'rba',
    'I2', 'index', 1, 'weekly', 'monthly', true,
    'RBA I2, all items, AUD terms. Column Series ID to confirm against the live CSV.' ),

  -- Daily, so no alert per print — same as US 10Y.
  ( 'AU 10Y Government Bond Yield', 'AU 10Y', 'au', 'bond_yield', 'rba',
    'F2:FCMYGBAG10D', 'percent', 2, 'daily', 'daily', false,
    'RBA F2 Capital market yields, government bonds, daily. The RBA adapter keeps '
    || 'each business day for a daily row; column to confirm against the live CSV.' )
) AS v(name, short_label, region, category, provider, provider_table_ref,
       unit, decimals, poll_frequency, period_granularity, alert_on_new_print, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM economic_indicators e WHERE e.name = v.name
);

-- AU CPI was seeded in June against the quarterly CPI with a bare 'CPI' ref.
-- On 26 November 2025 ABS moved CPI to version 2.0.0, monthly, rebased to
-- September 2025 = 100; the quarterly series is now the separate CPI_Q. Point
-- the row at the pinned monthly dataflow so its diagnostic run asks the right
-- question, and poll it daily. It stays inactive: the data key and activation
-- come from a verified live run.
UPDATE economic_indicators
SET provider_table_ref = 'ABS,CPI,2.0.0',
    period_granularity = 'monthly',
    poll_frequency     = 'daily',
    notes = 'Monthly CPI (ABS dataflow CPI, version 2.0.0 — pinned so a future '
         || 'rebase arrives as a 404, not a rewrite of every stored period). All '
         || 'groups, Australia, index, original; base September 2025 = 100, back '
         || 'series from April 2024. Data key to be written from the first live '
         || 'response. Not CPI_M (discontinued) and not CPI_Q (quarterly).'
WHERE short_label = 'AU CPI'
  AND provider = 'abs'
  AND is_active = false;
