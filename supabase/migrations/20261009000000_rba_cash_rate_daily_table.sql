-- ── RBA cash rate: read the target, not its monthly average ─────────────────
--
-- The 'RBA Cash Rate Target' row pointed at table F1.1, whose FIRMMCRT series is
-- the cash rate target's MONTHLY AVERAGE. A decision late in a month therefore
-- showed as a fraction of a move: the 29 Sep 2026 hike to 4.60 (effective
-- 30 Sep) was stored as 4.36, and May's move to 4.35 as 4.31.
--
-- Table F1 carries the target daily (FIRMMCRTD). The RBA adapter collapses a
-- daily table to the last value of each month, so September now reads 4.60.
--
-- Every observation ingested from F1.1 is an average, so retire them rather
-- than leave a history that disagrees with the new series. They are kept as
-- non-current vintages, not deleted; rows already read from F1 are left alone.
-- With no current rows left, the next daily indicator poll treats the series
-- as a first ingest and backfills it from F1.

UPDATE economic_indicators
SET provider_table_ref = 'F1:FIRMMCRTD',
    notes = 'RBA table F1 (Interest Rates & Yields – Money Market – Daily), series '
         || 'FIRMMCRTD. The adapter keeps the last daily value of each month. Not '
         || 'F1.1: its FIRMMCRT is the monthly average of the target, which shows '
         || 'a late-month decision as a fraction of a move.'
WHERE provider = 'rba'
  AND provider_table_ref = 'F1.1';

UPDATE indicator_observations o
SET is_current = false
FROM economic_indicators i
WHERE o.indicator_id = i.id
  AND i.provider = 'rba'
  AND i.provider_table_ref = 'F1:FIRMMCRTD'
  AND o.is_current = true
  AND coalesce(o.raw->>'column', '') <> 'FIRMMCRTD';
