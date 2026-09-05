-- ============================================================
-- CORPORATE HOLDINGS — the persist step, as assertions
-- Session 2 acceptance: re-running the workflow over the same
-- documents commits zero new rows.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/research_ingest_persist.sql
--
-- Runs inside one transaction and ROLLBACKs. Uses a throwaway company
-- rather than the seeded register, so a failed run cannot leave a real
-- record half-written.
-- ============================================================

BEGIN;

INSERT INTO research_companies
  (id, slug, legal_name, jurisdiction, primary_archetype, tier)
VALUES
  ('00000000-0000-4000-8000-0000000000c1', 'persist-fixture',
   'Persist Fixture Limited', 'AU', 'treasury_allocation', 'regional');

INSERT INTO research_documents
  (id, company_id, document_type, source_class, title, venue, announcement_id, published_at)
VALUES
  ('00000000-0000-4000-8000-0000000000e1',
   '00000000-0000-4000-8000-0000000000c1', 'announcement', 'exchange_announcement',
   'Treasury update', 'asx', 'PF-001', '2026-01-15'),
  ('00000000-0000-4000-8000-0000000000e2',
   '00000000-0000-4000-8000-0000000000c1', 'other', 'company_web',
   'About us', 'company', 'PF-WEB', '2026-02-01');


-- ------------------------------------------------------------
-- The payload the workflow's persist step sends. Note what the
-- classification carries: `event_natural_key`, not a subject id. The
-- workflow cannot know the id of a row this same call is inserting, so
-- the function resolves it after the events are written — which is also
-- why the two have to be in one transaction.
-- ------------------------------------------------------------
CREATE TEMP TABLE payload AS SELECT $json$
{
  "company_id": "00000000-0000-4000-8000-0000000000c1",
  "events": [
    {
      "event_type": "acquisition",
      "event_date": "2026-01-15",
      "quantity": "6.08914",
      "consideration_native": "1000000",
      "native_currency": "AUD",
      "fees_included": "true",
      "headline": "First acquisition",
      "detail": "Inclusive of fees and expenses.",
      "disclosure_venue": "asx",
      "basis": "direct_spot",
      "source_document_id": "00000000-0000-4000-8000-0000000000e1",
      "natural_key": "pf:acq:2026-01-15"
    },
    {
      "event_type": "policy_adoption",
      "event_date": "2025-11-01",
      "headline": "Treasury management policy adopted",
      "disclosure_venue": "asx",
      "source_document_id": "00000000-0000-4000-8000-0000000000e1",
      "natural_key": "pf:policy:2025-11"
    }
  ],
  "snapshots": [
    {
      "as_of_date": "2026-01-15",
      "quantity": "6.08914",
      "basis": "direct_spot",
      "source_document_id": "00000000-0000-4000-8000-0000000000e1",
      "natural_key": "pf:pos:2026-01-15"
    }
  ],
  "findings": [
    {
      "finding_type": "holdings_change",
      "occurred_on": "2026-01-15",
      "headline": "First acquisition disclosed",
      "materiality": "0.82",
      "event_natural_key": "pf:acq:2026-01-15",
      "source_document_id": "00000000-0000-4000-8000-0000000000e1",
      "natural_key": "pf:finding:acq"
    },
    {
      "finding_type": "holdings_change",
      "occurred_on": "2026-01-15",
      "headline": "Shares on issue restated by 0.03%",
      "is_suppressed": "true",
      "suppressed_reason": "Below the 0.5% materiality floor",
      "source_document_id": "00000000-0000-4000-8000-0000000000e1",
      "natural_key": "pf:finding:restatement"
    }
  ],
  "classifications": [
    {
      "event_natural_key": "pf:acq:2026-01-15",
      "field_key": "ledger_event",
      "classification": "publishable",
      "reason": "A disclosed fact with a citation."
    }
  ]
}
$json$::JSONB AS body;


-- ------------------------------------------------------------
-- First run — everything inserts.
-- ------------------------------------------------------------
DO $$
DECLARE result JSONB;
BEGIN
  SELECT commit_research_ingest(body) INTO result FROM payload;

  IF (result->'events'->>'inserted')::INT <> 2 THEN
    RAISE EXCEPTION 'Expected 2 events inserted, got %', result->'events';
  END IF;
  IF (result->'snapshots'->>'inserted')::INT <> 1
     OR (result->'findings'->>'inserted')::INT <> 2
     OR (result->'classifications'->>'inserted')::INT <> 1 THEN
    RAISE EXCEPTION 'First run did not insert the whole payload: %', result;
  END IF;

  RAISE NOTICE 'Persist PASSED: first run inserted the payload';
END $$;

-- The classification found its subject even though the event id did not
-- exist when the payload was written.
DO $$
DECLARE linked INT;
BEGIN
  SELECT count(*) INTO linked
    FROM research_classifications c
    JOIN treasury_events e ON e.id = c.subject_id
   WHERE c.subject_table = 'treasury_events'
     AND e.natural_key = 'pf:acq:2026-01-15';

  IF linked <> 1 THEN
    RAISE EXCEPTION
      'Persist FAILED: the classification did not resolve its event by natural key';
  END IF;

  RAISE NOTICE 'Persist PASSED: the classification resolved its subject within the transaction';
END $$;


-- ------------------------------------------------------------
-- Second run, identical payload — zero new rows. The session 2
-- acceptance criterion.
-- ------------------------------------------------------------
DO $$
DECLARE result JSONB; total_events INT;
BEGIN
  SELECT commit_research_ingest(body) INTO result FROM payload;

  IF (result->'events'->>'inserted')::INT <> 0
     OR (result->'snapshots'->>'inserted')::INT <> 0
     OR (result->'findings'->>'inserted')::INT <> 0
     OR (result->'classifications'->>'inserted')::INT <> 0 THEN
    RAISE EXCEPTION 'Re-run inserted new rows: %', result;
  END IF;

  -- Updated rather than inserted is the correct outcome, not "did nothing":
  -- a re-ingest that found a corrected figure has to be able to write it.
  IF (result->'events'->>'updated')::INT <> 2 THEN
    RAISE EXCEPTION 'Re-run did not update in place: %', result;
  END IF;

  SELECT count(*) INTO total_events FROM treasury_events
   WHERE company_id = '00000000-0000-4000-8000-0000000000c1';
  IF total_events <> 2 THEN
    RAISE EXCEPTION 'Re-run duplicated events: % rows', total_events;
  END IF;

  RAISE NOTICE 'Persist PASSED: re-running over the same documents committed zero new rows';
END $$;


-- ------------------------------------------------------------
-- The gate still applies inside the transaction. A payload sourcing a
-- ledger event from the About page must take the whole commit down,
-- not commit the rows before it.
-- ------------------------------------------------------------
DO $$
DECLARE raised BOOLEAN := FALSE; after_count INT;
BEGIN
  BEGIN
    PERFORM commit_research_ingest($json$
    {
      "company_id": "00000000-0000-4000-8000-0000000000c1",
      "events": [
        {
          "event_type": "acquisition",
          "event_date": "2026-02-01",
          "quantity": "1.0",
          "headline": "Should not commit",
          "source_document_id": "00000000-0000-4000-8000-0000000000e2",
          "natural_key": "pf:acq:web"
        }
      ]
    }
    $json$::JSONB);
  EXCEPTION WHEN OTHERS THEN
    raised := TRUE;
  END;

  IF NOT raised THEN
    RAISE EXCEPTION 'Persist FAILED: a company_web-sourced event committed through the RPC';
  END IF;

  SELECT count(*) INTO after_count FROM treasury_events
   WHERE company_id = '00000000-0000-4000-8000-0000000000c1';
  IF after_count <> 2 THEN
    RAISE EXCEPTION 'Persist FAILED: the rejected commit left % events behind', after_count;
  END IF;

  RAISE NOTICE 'Persist PASSED: a gated payload rolled back whole';
END $$;


-- A suppressed finding is stored, not dropped. "We looked and it was
-- below the floor" and "we did not look" have to be distinguishable.
DO $$
DECLARE suppressed INT;
BEGIN
  SELECT count(*) INTO suppressed FROM research_findings
   WHERE company_id = '00000000-0000-4000-8000-0000000000c1' AND is_suppressed;
  IF suppressed <> 1 THEN
    RAISE EXCEPTION 'Persist FAILED: the suppressed finding was dropped rather than stored';
  END IF;
END $$;

ROLLBACK;
