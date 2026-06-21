-- ── Economic indicators: add an 'activity' category + the 'oecd' provider ──────
-- Adds a business-activity macro indicator to the panel (the slot PMI would fill).
--
-- WHY NOT "PMI": the headline PMIs (ISM, S&P Global / Judo Bank) are proprietary
-- and not on FRED, which is the feature's free-source model. The free, live
-- stand-in for US business activity is the Philadelphia Fed Manufacturing
-- Business Outlook Survey — Current General Activity diffusion index (FRED
-- GACDFSA066MSFRBPHI): monthly, seasonally adjusted, 0-centred (positive =
-- expansion). It is a diffusion index, not a 50-centred PMI and not a 100-centred
-- confidence index — see the display notes in the web format layer.
--
-- AU counterpart is DEFERRED: OECD's Business Confidence Index for Australia is
-- the intended local equivalent, but it now lives only on OECD's SDMX API. The
-- FRED mirror (BSCICP03AUM665S) froze in early 2024 and is unusable. We reserve a
-- new 'oecd' provider and seed the AU row is_active=false — the same pattern as
-- the AU CPI / ABS deferral. No adapter is built here; flipping is_active on does
-- nothing until an 'oecd' adapter exists (runIndicatorPoll skips providers with
-- no registered adapter).

-- 1. Allow the new category and provider on the registry, and the new source on
--    observations (source mirrors provider).
ALTER TABLE economic_indicators DROP CONSTRAINT IF EXISTS economic_indicators_category_check;
ALTER TABLE economic_indicators
  ADD CONSTRAINT economic_indicators_category_check
  CHECK (category IN ('policy_rate','money_supply','inflation','activity'));

ALTER TABLE economic_indicators DROP CONSTRAINT IF EXISTS economic_indicators_provider_check;
ALTER TABLE economic_indicators
  ADD CONSTRAINT economic_indicators_provider_check
  CHECK (provider IN ('fred','rba','abs','oecd'));

ALTER TABLE indicator_observations DROP CONSTRAINT IF EXISTS indicator_observations_source_check;
ALTER TABLE indicator_observations
  ADD CONSTRAINT indicator_observations_source_check
  CHECK (source IN ('fred','rba','abs','oecd','manual'));

-- 2. Seed the two activity indicators. Idempotent on name + region.

-- US — Philadelphia Fed manufacturing activity (LIVE on FRED). -----------------
INSERT INTO economic_indicators
  (name, short_label, region, category, provider,
   provider_series_code, provider_table_ref,
   unit, decimals, poll_frequency,
   alert_on_new_print, alert_change_threshold, is_active, notes)
SELECT
  'US Manufacturing Activity (Philly Fed)', 'US Mfg Activity', 'us', 'activity', 'fred',
  'GACDFSA066MSFRBPHI', NULL,
  'index', 1, 'weekly',
  FALSE, 20, TRUE,
  'Philadelphia Fed Manufacturing Business Outlook Survey — Current General '
  || 'Activity diffusion index (FRED GACDFSA066MSFRBPHI). Seasonally adjusted, '
  || 'monthly, 0-centred: positive = net expansion, negative = net contraction. '
  || 'A free, live stand-in for a manufacturing PMI (headline ISM / S&P Global '
  || 'PMIs are proprietary and not on FRED). alert_on_new_print is FALSE with a '
  || '20-point threshold: this index is mean-reverting and noisy month to month, '
  || 'and activity is macro CONTEXT, not the core money/debasement thesis — so '
  || 'only a large swing proposes a content beat, never every monthly print.'
WHERE NOT EXISTS (
  SELECT 1 FROM economic_indicators e
  WHERE e.name = 'US Manufacturing Activity (Philly Fed)' AND e.region = 'us'
);

-- AU — OECD Business Confidence (DEFERRED, is_active=false). --------------------
INSERT INTO economic_indicators
  (name, short_label, region, category, provider,
   provider_series_code, provider_table_ref,
   unit, decimals, poll_frequency,
   alert_on_new_print, alert_change_threshold, is_active, notes)
SELECT
  'AU Business Confidence (OECD)', 'AU Bus. Confidence', 'au', 'activity', 'oecd',
  NULL, 'DSD_STES@DF_CLI / AUS.M.BCICP...AA',
  'index', 1, 'weekly',
  FALSE, NULL, FALSE,
  'DEFERRED — no oecd adapter yet. Intended local counterpart to the US activity '
  || 'card: OECD Business Confidence Index for Australia (BCI, amplitude-adjusted, '
  || 'centred at 100; >100 = optimism). Only live on OECD''s SDMX API — the FRED '
  || 'mirror BSCICP03AUM665S froze in early 2024 (OECD wound down its MEI feed). '
  || 'provider_table_ref is a best-guess SDMX key; CONFIRM against the live OECD '
  || 'SDMX endpoint when the adapter is built. NAB Business Confidence is the paid '
  || 'alternative. NOTE the scales differ: AU BCI is centred at 100, the US Philly '
  || 'Fed card at 0 — do not compare values across the two activity cards. Flip '
  || 'is_active to true once an oecd adapter exists.'
WHERE NOT EXISTS (
  SELECT 1 FROM economic_indicators e
  WHERE e.name = 'AU Business Confidence (OECD)' AND e.region = 'au'
);
