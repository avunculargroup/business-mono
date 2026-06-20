-- ============================================================
-- SEED — economic_indicators (v1, six indicators)
-- Part of: docs/features/economic-indicators  (see ../feature-spec.md)
-- Run AFTER the economic_indicators table exists (Session 1).
-- ============================================================
--
-- CONFIDENCE NOTES — read before trusting blindly:
--   FRED series codes below (FEDFUNDS, M2SL, CPIAUCSL) are stable,
--   permanent identifiers — trust them.
--   RBA table refs (F1.1, D3) are stable, but the *column header* the
--   adapter keys off MUST be confirmed against the live CSV at build —
--   D3 ships M1, M3, Broad money and Money base side by side.
--   The ABS row (AU CPI) is DEFERRED (is_active = false) per the spec:
--   the dataflow ID is a best guess and the adapter isn't built yet.
--
--   created_by is left NULL here. If you want provenance, swap NULL for
--   a subquery against team_members, e.g.
--     (SELECT id FROM team_members WHERE full_name = 'Chris' LIMIT 1)
-- ============================================================

INSERT INTO economic_indicators
  (name, short_label, region, category, provider,
   provider_series_code, provider_table_ref,
   unit, decimals, poll_frequency,
   alert_on_new_print, alert_change_threshold, is_active, notes)
VALUES

-- 1. RBA cash rate target ------------------------------------
( 'RBA Cash Rate Target', 'RBA Cash Rate', 'au', 'policy_rate', 'rba',
  NULL, 'F1.1',
  'percent', 2, 'daily',
  true, NULL, true,
  'RBA table F1.1 (Interest Rates & Yields – Money Market). Confirm the '
  || 'cash-rate-target column header against the live CSV. Daily poll so a '
  || 'decision is caught same day; it no-ops between the ~8 meetings/yr. '
  || 'See "hold vs change" note at the foot of this file — a HOLD will not '
  || 'create a new observation under the revision rules.' ),

-- 2. US Fed funds rate ---------------------------------------
( 'US Federal Funds Rate', 'Fed Funds', 'us', 'policy_rate', 'fred',
  'FEDFUNDS', NULL,
  'percent', 2, 'daily',
  true, NULL, true,
  'FEDFUNDS = monthly average effective rate. If you would rather track the '
  || 'policy TARGET RANGE (changes on the FOMC date, not a monthly average), '
  || 'switch to DFEDTARU (upper bound, daily). Pick one — do not seed both.' ),

-- 3. US M2 money supply --------------------------------------
( 'US M2 Money Supply', 'US M2', 'us', 'money_supply', 'fred',
  'M2SL', NULL,
  'usd_billion', 1, 'weekly',
  true, NULL, true,
  'M2SL = seasonally adjusted, monthly, USD billions. Weekly poll is ample '
  || 'for monthly data. M2REAL exists if you ever want the inflation-adjusted '
  || 'cut, but the nominal line is the debasement chart.' ),

-- 4. AU broad money ------------------------------------------
( 'AU Broad Money', 'AU Broad Money', 'au', 'money_supply', 'rba',
  NULL, 'D3',
  'aud_billion', 1, 'weekly',
  true, NULL, true,
  'RBA table D3 (Monetary Aggregates). D3 carries M1, M3, Broad money and '
  || 'Money base — seed targets the "Broad money" (seasonally adjusted) '
  || 'column; confirm the exact header at build. If RBA CSV parsing is '
  || 'painful, FRED mirror MABMM301AUM189S is a fallback (provider would '
  || 'then become fred).' ),

-- 5. US CPI --------------------------------------------------
( 'US CPI (All Items)', 'US CPI', 'us', 'inflation', 'fred',
  'CPIAUCSL', NULL,
  'index', 1, 'weekly',
  true, NULL, true,
  'CPIAUCSL = All Urban Consumers, All Items, SA, index (1982–84=100). Store '
  || 'the index level and compute YoY inflation % in the view (keeps one '
  || 'series). BLS headlines the 12-month change off the NSA series '
  || '(CPIAUCNS) — only switch if you want to match the headline number '
  || 'exactly.' ),

-- 6. AU CPI (DEFERRED — seeded but inactive) -----------------
( 'AU CPI (All Groups)', 'AU CPI', 'au', 'inflation', 'abs',
  NULL, 'CPI',
  'index', 1, 'weekly',
  true, NULL, false,                       -- is_active = false: not polled yet
  'DEFERRED per spec — ABS adapter not built. provider_table_ref "CPI" is the '
  || 'best-guess Data API dataflow for the quarterly All-Groups, eight-capital '
  || 'weighted-average index; CONFIRM against the live ABS SDMX endpoint. '
  || 'Two simpler paths if ABS SDMX is too fiddly: (a) the ABS monthly CPI '
  || 'indicator dataflow, or (b) FRED OECD mirror AUSCPIALLQINMEI (quarterly). '
  || 'Flip is_active to true once an adapter exists.' );

-- ============================================================
-- MODELLING WRINKLE — policy-rate "holds"
-- ============================================================
-- The revision rules treat an unchanged value as a no-op, so a policy rate
-- that is HELD produces no new observation. That is correct for the time
-- series, but it means the "held for the third meeting" line in Simon's
-- digest cannot come from this table alone — a hold is a non-event here.
--
-- If you want Simon to narrate holds, that signal is calendar-driven (an RBA
-- or FOMC meeting occurred, rate unchanged), not observation-driven. Keep it
-- out of v1; note it as a follow-up so the two triggers don't get tangled.
-- ============================================================
