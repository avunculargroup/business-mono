-- 2026-07-09 — Repoint the Gold indicator to a live FRED series
--
-- WHY: the economic_indicators row 'Gold (USD/oz)' was seeded (in
-- 20260703000000_add_market_indicators.sql) with FRED series GOLDAMGBD228NLBM
-- (LBMA Gold Price, 10:30am London AM fixing). That series was DISCONTINUED by
-- FRED after ICE Benchmark Administration withdrew the LBMA licence, so the FRED
-- observations endpoint no longer returns usable data for it. The indicator poll
-- (apps/agents/src/lib/indicators/runIndicatorPoll.ts) therefore fails the fetch
-- on every run and inserts nothing: Gold has had ZERO observations since it was
-- seeded on 2026-07-04, while its three daily siblings (DXY / S&P 500 / US 10Y),
-- seeded in the same migration, print normally. Net effect: the dashboard gold
-- tile never gets a first print.
--
-- FIX: point the row at a currently-active FRED daily USD gold series. Once the
-- code is corrected the poll self-heals on its next run — Gold has 0 rows, so
-- firstIngest is still true and the poll backfills ~90 days automatically. No
-- data cleanup is required.
--
-- ⚠️  VERIFY BEFORE MERGE — the replacement code below is a PLACEHOLDER. FRED's
-- API host was unreachable from the build environment, so no live series could
-- be confirmed here. Set new_code to a series you have confirmed returns recent
-- daily observations:
--   curl "https://api.stlouisfed.org/fred/series/observations?series_id=<CODE>\
--&api_key=$FRED_API_KEY&file_type=json&sort_order=desc&limit=3"
-- and check the newest non-"." date is within the last few business days.
--
-- Notes on candidates:
--   • Do NOT swap to GOLDPMGBD228NLBM (LBMA PM fixing) — it shares the same
--     withdrawn ICE/LBMA licence and is discontinued too.
--   • If FRED's free tier no longer carries a daily USD spot-gold series at all,
--     this row needs a different data provider — that is a code change (a new
--     adapter alongside fred.ts / rba.ts), NOT this data-only migration. Raise
--     it separately.
--
-- The guard below deliberately FAILS this migration while new_code is still the
-- placeholder, so the branch cannot be merged un-verified and silently repoint
-- Gold to another dead code.

DO $$
DECLARE
  old_code TEXT := 'GOLDAMGBD228NLBM';
  new_code TEXT := 'REPLACE_WITH_VERIFIED_FRED_GOLD_SERIES';
BEGIN
  IF new_code = 'REPLACE_WITH_VERIFIED_FRED_GOLD_SERIES' THEN
    RAISE EXCEPTION
      'Gold indicator repoint aborted: set new_code to a VERIFIED live FRED gold series before merging (see the header comment in this migration).';
  END IF;

  UPDATE economic_indicators
     SET provider_series_code = new_code,
         notes = 'FRED ' || new_code || ' = daily USD gold price. Replaces '
               || 'GOLDAMGBD228NLBM (LBMA AM fixing), which FRED discontinued '
               || 'when the ICE/LBMA licence was withdrawn. Daily series '
               || '(business days); occasional holiday gaps are expected.'
   WHERE provider_series_code = old_code;

  IF NOT FOUND THEN
    -- Re-run after a successful repoint, or the row was already changed by hand.
    RAISE NOTICE 'No economic_indicators row with provider_series_code=%, nothing to repoint.', old_code;
  END IF;
END $$;
