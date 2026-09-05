-- ============================================================
-- CORPORATE HOLDINGS — session 1 acceptance criteria
-- Spec: docs/features/corporate-holdings/README.md → Session 1
--
-- Run against a database with 20260904000000_add_corporate_holdings.sql
-- applied:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/corporate_holdings_acceptance.sql
--
-- The whole file runs inside one transaction and ROLLBACKs at the end.
-- That is not tidiness: the record it hand-enters is Meridian Freight,
-- a wholly fictional entity from the demo fixture roster, and fixture
-- data reaching the real register is the one genuinely bad outcome the
-- feature guards against. Proving the round trip and keeping the
-- register clean are the same requirement, so the test commits nothing.
--
-- Every assertion RAISEs on failure, so a clean run printing the three
-- NOTICEs below is the pass condition.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Fixture: one company, four documents spanning four source classes.
-- ------------------------------------------------------------

INSERT INTO research_companies
  (id, slug, legal_name, jurisdiction, primary_archetype, self_described_archetype,
   reporting_standard, functional_currency, presentation_currency, tier,
   expected_disclosure_cadence, market_cap_band, funding_source, curator_notes)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'demo-meridian-freight',
   'Meridian Freight Group Limited', 'NZ',
   'treasury_allocation', 'treasury_company',
   'nz_ifrs', 'AUD', 'NZD', 'regional',
   'episodic', 'micro', 'operating_cash',
   'Acceptance fixture. Fictional entity; never committed.');

INSERT INTO research_documents
  (id, company_id, document_type, source_class, title, venue, announcement_id,
   pdf_url, published_at, is_audited)
VALUES
  -- Rank 1. Strong enough for anything.
  ('00000000-0000-4000-8000-0000000000d1',
   '00000000-0000-4000-8000-000000000001', 'offer_document', 'regulated_disclosure',
   'Meridian Freight Group — Product Disclosure Statement', 'asx', 'MFGX-PDS-001',
   'https://example.invalid/fixtures/mfg-pds.pdf', '2025-11-03', TRUE),
  -- Rank 2. The minimum for a ledger event.
  ('00000000-0000-4000-8000-0000000000d2',
   '00000000-0000-4000-8000-000000000001', 'announcement', 'exchange_announcement',
   'Treasury Update', 'asx', 'MFGX-ANN-004',
   'https://example.invalid/fixtures/mfg-ann-004.pdf', '2025-06-04', FALSE),
  -- Rank 4. Fine for an operating metric, not for the ledger.
  ('00000000-0000-4000-8000-0000000000d3',
   '00000000-0000-4000-8000-000000000001', 'other', 'investor_presentation',
   'Q3 FY26 Investor Presentation', 'nzx', 'MFGX-PRES-Q3',
   'https://example.invalid/fixtures/mfg-q3fy26.pdf', '2026-04-22', FALSE),
  -- Rank 5. The About page that claimed self-custody.
  ('00000000-0000-4000-8000-0000000000d4',
   '00000000-0000-4000-8000-000000000001', 'other', 'company_web',
   'Meridian Freight — About us', NULL, 'MFGX-WEB-ABOUT',
   'https://example.invalid/fixtures/mfg-about.html', '2026-02-10', FALSE);

INSERT INTO fx_rates (rate_date, base_currency, quote_currency, rate, source) VALUES
  ('2026-04-20', 'NZD', 'AUD', 0.92000000, 'acceptance fixture');


-- ------------------------------------------------------------
-- Criterion 1 — inserting a treasury_event sourced from a
-- company_web document raises.
--
-- Rule 2 is a trigger, not a convention. The About page is exactly the
-- source that produced the wrong custody answer, and the gate has to
-- reject it at write time rather than flag it at read time.
-- ------------------------------------------------------------

DO $$
DECLARE raised BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO treasury_events
      (company_id, event_type, event_date, quantity, consideration_native,
       native_currency, headline, basis, source_document_id, natural_key)
    VALUES
      ('00000000-0000-4000-8000-000000000001', 'acquisition', '2026-02-10',
       1.0, 100000, 'AUD', 'Acquisition claimed on the About page',
       'direct_spot', '00000000-0000-4000-8000-0000000000d4', 'mfg:web:should-fail');
  EXCEPTION WHEN OTHERS THEN
    raised := TRUE;
    IF SQLERRM NOT LIKE '%below the minimum%' THEN
      RAISE EXCEPTION 'Gate raised, but not for the reason expected: %', SQLERRM;
    END IF;
  END;

  IF NOT raised THEN
    RAISE EXCEPTION
      'Criterion 1 FAILED: a company_web document was accepted as the source of a ledger event';
  END IF;

  RAISE NOTICE 'Criterion 1 PASSED: the source-class gate rejected a company_web ledger event';
END $$;


-- ------------------------------------------------------------
-- Criterion 2 — v_research_ledger returns the first acquisition with
-- consideration_aud = 1000000 and a non-null source_url.
--
-- The A$1.0m figure is the one three secondary sources got wrong by
-- roughly half. Provenance is what makes the number checkable, so a
-- ledger row that cannot name its document is a failure even when the
-- number is right.
-- ------------------------------------------------------------

INSERT INTO treasury_events
  (company_id, event_type, event_date, quantity, consideration_native,
   native_currency, fees_included, headline, detail, disclosure_venue, basis,
   source_document_id, natural_key)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'acquisition', '2025-06-04',
   6.08914, 1000000, 'AUD', TRUE,
   'First acquisition',
   'A$164,227 average per bitcoin, inclusive of fees and expenses.',
   'asx', 'direct_spot',
   '00000000-0000-4000-8000-0000000000d2', 'mfg:acq:2025-06-04'),
  -- A non-AUD event, so the FX join is exercised rather than assumed.
  ('00000000-0000-4000-8000-000000000001', 'capital_posture_change', '2026-04-20',
   NULL, 500000, 'NZD', NULL,
   'On-market buyback announced while issuance facility undrawn',
   'No at-the-market capital drawn during the March quarter.',
   'nzx', NULL,
   '00000000-0000-4000-8000-0000000000d2', 'mfg:posture:2026-04-20');

DO $$
DECLARE row_found RECORD;
BEGIN
  SELECT consideration_aud, source_url, source_class, basis_comparable, classification
    INTO row_found
    FROM v_research_ledger
   WHERE slug = 'demo-meridian-freight'
     AND event_type = 'acquisition'
   ORDER BY event_date ASC
   LIMIT 1;

  IF row_found IS NULL THEN
    RAISE EXCEPTION 'Criterion 2 FAILED: no acquisition row in v_research_ledger';
  END IF;
  IF row_found.consideration_aud <> 1000000 THEN
    RAISE EXCEPTION 'Criterion 2 FAILED: consideration_aud is %, expected 1000000',
      row_found.consideration_aud;
  END IF;
  IF row_found.source_url IS NULL THEN
    RAISE EXCEPTION 'Criterion 2 FAILED: source_url is null';
  END IF;
  IF row_found.basis_comparable IS NOT TRUE THEN
    RAISE EXCEPTION 'Criterion 2 FAILED: direct_spot did not resolve as comparable';
  END IF;
  -- Unclassified means internal. A field Lex has not seen must never
  -- default to publishable.
  IF row_found.classification <> 'internal' THEN
    RAISE EXCEPTION 'Criterion 2 FAILED: an unclassified field defaulted to %',
      row_found.classification;
  END IF;

  RAISE NOTICE 'Criterion 2 PASSED: consideration_aud = % from %',
    row_found.consideration_aud, row_found.source_class;
END $$;

-- The FX limb: a NZD event converts, and does so at a stated rate.
DO $$
DECLARE aud NUMERIC; used NUMERIC;
BEGIN
  SELECT consideration_aud, fx_rate_used INTO aud, used
    FROM v_research_ledger
   WHERE slug = 'demo-meridian-freight' AND event_type = 'capital_posture_change';

  IF aud IS DISTINCT FROM 460000.00 THEN
    RAISE EXCEPTION 'FX FAILED: NZD 500000 at 0.92 produced %, expected 460000', aud;
  END IF;
  IF used IS NULL THEN
    RAISE EXCEPTION 'FX FAILED: a converted figure was returned without the rate that made it';
  END IF;
END $$;


-- ------------------------------------------------------------
-- Criterion 3 — a holdings row with a non-comparable basis is absent
-- from every aggregate.
--
-- Three research records produced three unrelated mechanisms by which
-- a stated figure overstates the corporate position. The basis is what
-- decides; the row is still rendered, it just never enters a total.
-- ------------------------------------------------------------

INSERT INTO treasury_holdings_snapshots
  (company_id, as_of_date, asset, instrument_type, quantity, basis,
   look_through_btc_equivalent, is_related_party_vehicle, includes_customer_assets,
   source_document_id, natural_key)
VALUES
  ('00000000-0000-4000-8000-000000000001', '2026-03-31', 'btc', 'spot',
   12.30000000, 'direct_spot', NULL, FALSE, FALSE,
   '00000000-0000-4000-8000-0000000000d2', 'mfg:pos:2026-03-31:spot'),
  -- Units in a fund the issuer manages. Renders, never sums.
  ('00000000-0000-4000-8000-000000000001', '2026-03-31', 'btc', 'fund_units',
   889367.00000000, 'look_through', 194.85000000, TRUE, FALSE,
   '00000000-0000-4000-8000-0000000000d2', 'mfg:pos:2026-03-31:units'),
  -- Custodied for third parties. Same treatment, different reason.
  ('00000000-0000-4000-8000-000000000001', '2026-03-31', 'btc', 'other',
   28355.05000000, 'includes_customer_assets', NULL, FALSE, TRUE,
   '00000000-0000-4000-8000-0000000000d2', 'mfg:pos:2026-03-31:customer');

DO $$
DECLARE visible INT; aggregated NUMERIC;
BEGIN
  SELECT count(*) INTO visible
    FROM v_company_position
   WHERE slug = 'demo-meridian-freight' AND asset = 'btc';

  IF visible <> 3 THEN
    RAISE EXCEPTION
      'Criterion 3 FAILED: expected all 3 rows to render, saw %. Non-comparable rows are excluded from totals, not hidden.',
      visible;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO aggregated
    FROM v_company_position
   WHERE slug = 'demo-meridian-freight' AND asset = 'btc' AND basis_comparable;

  IF aggregated <> 12.30000000 THEN
    RAISE EXCEPTION
      'Criterion 3 FAILED: the comparable aggregate is %, expected 12.3. A non-comparable basis reached a total.',
      aggregated;
  END IF;

  RAISE NOTICE
    'Criterion 3 PASSED: 3 position rows render, % BTC aggregates', aggregated;
END $$;


-- ------------------------------------------------------------
-- Freshness — the same silence, two verdicts. Not a stated session 1
-- criterion, but the view is seeded here and the quiet-day path in
-- session 2 depends on it being right.
-- ------------------------------------------------------------

DO $$
DECLARE episodic_stale BOOLEAN; monthly_stale BOOLEAN;
BEGIN
  SELECT is_stale INTO episodic_stale
    FROM v_research_freshness WHERE slug = 'demo-meridian-freight';

  UPDATE research_companies SET expected_disclosure_cadence = 'monthly'
   WHERE slug = 'demo-meridian-freight';

  SELECT is_stale INTO monthly_stale
    FROM v_research_freshness WHERE slug = 'demo-meridian-freight';

  IF episodic_stale IS NOT DISTINCT FROM monthly_stale THEN
    RAISE EXCEPTION
      'Freshness FAILED: cadence made no difference, so staleness is a fixed window';
  END IF;
END $$;


-- Nothing here is real. Nothing here is kept.
ROLLBACK;
