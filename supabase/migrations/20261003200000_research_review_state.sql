-- ============================================================
-- CORPORATE HOLDINGS — review state, and the visibility bug
-- Spec: docs/features/corporate-holdings/schema-ingest-spec.md
--       → Consumers: visibility, clearance and the three surfaces
--       → Decided (29 September): review_state, Minute summaries
--
-- Minute's /register has shown nothing, with six entries cleared for it.
-- Visibility was two gates — is_published AND client_cleared — and no
-- human-facing control ever wrote is_published. The only writer was the
-- researchIngest resume branch, which has never run against a real record.
-- "Published" read as outward; the flag meant visible on the internal
-- register, and the internal register ignored it.
--
-- So the misnamed boolean becomes a state machine:
--   draft    — landed, unread. Where an agent-created record arrives.
--   internal — reviewed by a human; on the internal register.
--   retired  — kept for provenance, shown nowhere by default.
-- Clearance stays a separate human decision with a different standard, and
-- is only possible from `internal`.
--
-- Expand, then contract: is_published stays for the length of the deploy,
-- because the running apps still select it. Nothing reads or writes it after
-- this change ships; a later migration drops it.
-- ============================================================


-- ------------------------------------------------------------
-- 1. The state, who set it, and the subscriber summary
-- ------------------------------------------------------------

ALTER TABLE research_companies
  ADD COLUMN IF NOT EXISTS review_state TEXT NOT NULL DEFAULT 'draft'
    CHECK (review_state IN ('draft', 'internal', 'retired')),
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES team_members(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  -- Hand-written for subscribers, cleared with the entry. Never composed from
  -- curator_notes, which are internal voice and frequently outcome-shaped.
  ADD COLUMN IF NOT EXISTS client_summary TEXT;

COMMENT ON COLUMN research_companies.review_state IS
  'draft (landed, unread) → internal (reviewed; on the internal register) → retired. Replaces is_published, which read as outward and meant inward.';
COMMENT ON COLUMN research_companies.client_summary IS
  'The subscriber-facing summary, hand-written and cleared with the entry. Implementation facts only: how an entity did this, never how it went for them.';


-- ------------------------------------------------------------
-- 2. Backfill, as decided on 29 September
--
-- The three seeded records and every cleared one become internal; the rest,
-- written by the research pass from 23 September, become draft. Nothing that
-- an internal reader sees today disappears: the internal register ignored
-- is_published, and from this change it shows internal records by default
-- with draft one filter away.
-- ------------------------------------------------------------

UPDATE research_companies
   SET review_state = 'internal'
 WHERE review_state = 'draft'
   AND (slug IN ('locate-technologies', 'digitalx', 'block-inc') OR client_cleared);


-- ------------------------------------------------------------
-- 3. Clearance needs a summary
--
-- Decided 29 September: clearance is blocked where client_summary is empty.
-- None of the six cleared records has one, because the column did not exist
-- — Locate, DigitalX, Block, Strategy, Metaplanet and Sequans. Their
-- clearance is withdrawn here. No subscriber loses anything: none of the six
-- was visible, because is_published was false on every record. Each is
-- re-cleared from /research/[slug] once its summary is written.
-- ------------------------------------------------------------

UPDATE research_companies
   SET client_cleared = FALSE,
       client_cleared_by = NULL,
       client_cleared_at = NULL
 WHERE client_cleared
   AND COALESCE(btrim(client_summary), '') = '';

-- Cleared-but-unreviewed was the nonsense state five records sat in. A
-- subscriber sees an entry only if a human reviewed it AND a human cleared it
-- AND someone wrote what they will read.
ALTER TABLE research_companies DROP CONSTRAINT IF EXISTS client_clearance_needs_review;
ALTER TABLE research_companies ADD CONSTRAINT client_clearance_needs_review
  CHECK (
    client_cleared IS NOT TRUE
    OR (review_state = 'internal' AND COALESCE(btrim(client_summary), '') <> '')
  );


-- ------------------------------------------------------------
-- 4. The client read policies and the publishable view
--
-- Each is 20260911030000's (and 20260904000000's for the view), with
-- is_published = TRUE replaced by review_state = 'internal'.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "research_companies_client_read" ON research_companies;
CREATE POLICY "research_companies_client_read" ON research_companies
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND review_state = 'internal'
    AND client_cleared = TRUE
  );

DROP POLICY IF EXISTS "research_company_facts_client_read" ON research_company_facts;
CREATE POLICY "research_company_facts_client_read" ON research_company_facts
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM research_companies rc
      WHERE rc.id = research_company_facts.company_id
        AND rc.review_state = 'internal'
        AND rc.client_cleared = TRUE
    )
    AND EXISTS (
      SELECT 1 FROM field_source_minimums f
      WHERE f.field_key = research_company_facts.field_key
        AND f.client_fact_class = 'implementation'
    )
  );

DROP POLICY IF EXISTS "treasury_events_client_read" ON treasury_events;
CREATE POLICY "treasury_events_client_read" ON treasury_events
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM research_companies rc
      WHERE rc.id = treasury_events.company_id
        AND rc.review_state = 'internal'
        AND rc.client_cleared = TRUE
    )
  );

DROP POLICY IF EXISTS "company_listings_client_read" ON company_listings;
CREATE POLICY "company_listings_client_read" ON company_listings
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM research_companies rc
      WHERE rc.id = company_listings.company_id
        AND rc.review_state = 'internal'
        AND rc.client_cleared = TRUE
    )
  );

-- WITH (security_invoker = true): CREATE OR REPLACE VIEW resets a view's
-- options, and without it this view reads past RLS and anon can select it
-- (20261003010000).
CREATE OR REPLACE VIEW v_research_publishable WITH (security_invoker = true) AS
  SELECT l.*
  FROM v_research_ledger l
  JOIN research_companies c ON c.id = l.company_id
  WHERE c.review_state = 'internal'
    AND l.classification = 'publishable';
