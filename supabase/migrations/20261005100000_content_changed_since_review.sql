-- ============================================================
-- CORPORATE HOLDINGS — content changed since review
-- Spec: docs/features/corporate-holdings/build-progress.md
--       → Session 16 — changed since review
--
-- A reviewed record kept saying "reviewed" after its content was rewritten.
-- On 5 October the 333D record had its curator notes, tier and client summary
-- rewritten by direct SQL, kept review_state = 'internal' and its old
-- reviewed_at, and so vouched for text nobody had read. The rows carry their
-- own review_state and had the same exposure.
--
-- Comparing updated_at with reviewed_at is not enough. Any later write to a
-- workflow column bumps updated_at: on 333D, client clearance ran 25 seconds
-- after review, and that check would have flagged a record nobody edited.
--
-- So each table gets content_updated_at, set by a BEFORE UPDATE trigger only
-- when a content column changes. The trigger names the columns that are NOT
-- content (review, clearance, audit and run columns), so a column added later
-- counts as content until someone says otherwise.
--
-- changed_since_review is a stored generated column, so the rule is written
-- once per table and both the table and the views read the same answer:
--   - an internal row whose content changed after it was reviewed, or
--   - an internal row with no reviewed_at (every row the 20261003 backfills
--     made internal) whose content changed after this migration.
--
-- This flags and does not demote. The row keeps its state and stays on the
-- register, and if it is cleared, a subscriber still sees it. The review
-- queue lists it until someone reviews it again.
--
-- The check lives in the database because research writes reach the tables
-- directly, through commit_research_ingest and by hand, not only through the
-- app.
-- ============================================================


-- ------------------------------------------------------------
-- 1. The trigger
--
-- TG_ARGV lists the columns that are not content. A client summary written
-- in the same update that clears the record (client_cleared_at moves) is
-- covered by that clearance, so it does not count as an edit. A summary
-- rewritten later does count.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION stamp_content_updated_at()
RETURNS TRIGGER AS $$
DECLARE
  workflow TEXT[] := TG_ARGV;
  new_row  JSONB  := to_jsonb(NEW);
  old_row  JSONB  := to_jsonb(OLD);
BEGIN
  IF (new_row->'client_cleared_at') IS DISTINCT FROM (old_row->'client_cleared_at') THEN
    workflow := workflow || 'client_summary'::TEXT;
  END IF;

  IF (new_row - workflow) IS DISTINCT FROM (old_row - workflow) THEN
    NEW.content_updated_at := now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 2. Columns and triggers
--
-- content_updated_at starts NULL: no edit is known before this migration.
-- reviewed_at and content_updated_at are compared only on internal rows,
-- because a draft is not yet vouched for and a retired row is shown nowhere.
-- ------------------------------------------------------------

ALTER TABLE research_companies     ADD COLUMN IF NOT EXISTS content_updated_at TIMESTAMPTZ;
ALTER TABLE treasury_events        ADD COLUMN IF NOT EXISTS content_updated_at TIMESTAMPTZ;
ALTER TABLE research_company_facts ADD COLUMN IF NOT EXISTS content_updated_at TIMESTAMPTZ;
ALTER TABLE research_findings      ADD COLUMN IF NOT EXISTS content_updated_at TIMESTAMPTZ;

ALTER TABLE research_companies ADD COLUMN IF NOT EXISTS changed_since_review BOOLEAN
  GENERATED ALWAYS AS (
    review_state = 'internal' AND content_updated_at IS NOT NULL
    AND (reviewed_at IS NULL OR content_updated_at > reviewed_at)
  ) STORED;
ALTER TABLE treasury_events ADD COLUMN IF NOT EXISTS changed_since_review BOOLEAN
  GENERATED ALWAYS AS (
    review_state = 'internal' AND content_updated_at IS NOT NULL
    AND (reviewed_at IS NULL OR content_updated_at > reviewed_at)
  ) STORED;
ALTER TABLE research_company_facts ADD COLUMN IF NOT EXISTS changed_since_review BOOLEAN
  GENERATED ALWAYS AS (
    review_state = 'internal' AND content_updated_at IS NOT NULL
    AND (reviewed_at IS NULL OR content_updated_at > reviewed_at)
  ) STORED;
ALTER TABLE research_findings ADD COLUMN IF NOT EXISTS changed_since_review BOOLEAN
  GENERATED ALWAYS AS (
    review_state = 'internal' AND content_updated_at IS NOT NULL
    AND (reviewed_at IS NULL OR content_updated_at > reviewed_at)
  ) STORED;

DROP TRIGGER IF EXISTS research_companies_content_updated_at ON research_companies;
CREATE TRIGGER research_companies_content_updated_at
  BEFORE UPDATE ON research_companies
  FOR EACH ROW EXECUTE FUNCTION stamp_content_updated_at(
    'id', 'created_at', 'created_by', 'updated_at', 'content_updated_at', 'changed_since_review',
    'review_state', 'reviewed_by', 'reviewed_at',
    'client_cleared', 'client_cleared_by', 'client_cleared_at'
  );

-- ingest_run_id changes only with a fact, which already counts, and an
-- unchanged re-read keeps it. It records which run owns the review, which is
-- not content.
DROP TRIGGER IF EXISTS treasury_events_content_updated_at ON treasury_events;
CREATE TRIGGER treasury_events_content_updated_at
  BEFORE UPDATE ON treasury_events
  FOR EACH ROW EXECUTE FUNCTION stamp_content_updated_at(
    'id', 'created_at', 'updated_at', 'content_updated_at', 'changed_since_review',
    'review_state', 'reviewed_by', 'reviewed_at', 'ingest_run_id'
  );

DROP TRIGGER IF EXISTS research_company_facts_content_updated_at ON research_company_facts;
CREATE TRIGGER research_company_facts_content_updated_at
  BEFORE UPDATE ON research_company_facts
  FOR EACH ROW EXECUTE FUNCTION stamp_content_updated_at(
    'id', 'created_at', 'updated_at', 'content_updated_at', 'changed_since_review',
    'review_state', 'reviewed_by', 'reviewed_at'
  );

DROP TRIGGER IF EXISTS research_findings_content_updated_at ON research_findings;
CREATE TRIGGER research_findings_content_updated_at
  BEFORE UPDATE ON research_findings
  FOR EACH ROW EXECUTE FUNCTION stamp_content_updated_at(
    'id', 'created_at', 'content_updated_at', 'changed_since_review',
    'review_state', 'reviewed_by', 'reviewed_at', 'ingest_run_id'
  );


-- ------------------------------------------------------------
-- 3. Views: changed_since_review appended
--
-- Each is its live definition with the column added at the end (CREATE OR
-- REPLACE can add a trailing column, never reorder one), restated
-- WITH (security_invoker = true) because CREATE OR REPLACE drops the option.
-- v_research_publishable carries it too, because the internal app reads both
-- ledger views with one column list.
-- ------------------------------------------------------------

CREATE OR REPLACE VIEW v_research_ledger WITH (security_invoker = true) AS
  SELECT e.id,
    e.company_id,
    c.slug,
    c.legal_name,
    e.event_type,
    e.asset_class,
    e.event_date,
    e.quantity,
    e.consideration_native,
    e.native_currency,
    e.fees_included,
    CASE
      WHEN e.native_currency = 'AUD' THEN e.consideration_native
      ELSE e.consideration_native * fx.rate
    END AS consideration_aud,
    fx.rate AS fx_rate_used,
    fx.rate_date AS fx_rate_date,
    e.headline,
    e.detail,
    e.basis,
    hb.comparable AS basis_comparable,
    e.disclosure_venue,
    e.filing_entity,
    d.id AS source_document_id,
    d.title AS source_title,
    sc.code AS source_class,
    sc.rank AS source_rank,
    d.pdf_url AS source_url,
    d.published_at AS source_published_at,
    d.is_audited AS source_is_audited,
    COALESCE(cl.classification, 'internal') AS classification,
    sec.filing_item AS source_filing_item,
    e.review_state,
    e.ingest_run_id,
    e.changed_since_review
  FROM treasury_events e
    JOIN research_companies c ON c.id = e.company_id
    JOIN research_documents d ON d.id = e.source_document_id
    LEFT JOIN research_document_sections sec ON sec.id = e.source_section_id
    JOIN source_classes sc ON sc.code = COALESCE(sec.source_class, d.source_class)
    LEFT JOIN holding_bases hb ON hb.code = e.basis
    LEFT JOIN fx_rates fx ON fx.rate_date = e.event_date
      AND fx.base_currency = e.native_currency
      AND fx.quote_currency = 'AUD'
    LEFT JOIN research_classifications cl ON cl.subject_table = 'treasury_events'
      AND cl.subject_id = e.id
      AND cl.field_key = 'ledger_event'
  WHERE e.review_state <> 'retired';

CREATE OR REPLACE VIEW v_research_publishable WITH (security_invoker = true) AS
  SELECT l.id,
    l.company_id,
    l.slug,
    l.legal_name,
    l.event_type,
    l.asset_class,
    l.event_date,
    l.quantity,
    l.consideration_native,
    l.native_currency,
    l.fees_included,
    l.consideration_aud,
    l.fx_rate_used,
    l.fx_rate_date,
    l.headline,
    l.detail,
    l.basis,
    l.basis_comparable,
    l.disclosure_venue,
    l.filing_entity,
    l.source_document_id,
    l.source_title,
    l.source_class,
    l.source_rank,
    l.source_url,
    l.source_published_at,
    l.source_is_audited,
    l.classification,
    l.source_filing_item,
    l.review_state,
    l.ingest_run_id,
    l.changed_since_review
  FROM v_research_ledger l
    JOIN research_companies c ON c.id = l.company_id
  WHERE c.review_state = 'internal'
    AND l.review_state = 'internal'
    AND l.classification = 'publishable';

CREATE OR REPLACE VIEW v_company_facts WITH (security_invoker = true) AS
  SELECT f.id,
    f.company_id,
    c.slug,
    f.field_key,
    f.label,
    f.value,
    f.as_of,
    d.id AS source_document_id,
    d.title AS source_title,
    sc.code AS source_class,
    sc.rank AS source_rank,
    d.pdf_url AS source_url,
    d.published_at AS source_published_at,
    d.is_audited AS source_is_audited,
    lost.value AS conflicting_value,
    lost_doc.title AS conflicting_source_title,
    COALESCE(lost_sec.source_class, lost_doc.source_class) AS conflicting_source_class,
    lost_doc.pdf_url AS conflicting_source_url,
    sec.filing_item AS source_filing_item,
    f.review_state,
    f.changed_since_review
  FROM research_company_facts f
    JOIN research_companies c ON c.id = f.company_id
    JOIN research_documents d ON d.id = f.source_document_id
    LEFT JOIN research_document_sections sec ON sec.id = f.source_section_id
    JOIN source_classes sc ON sc.code = COALESCE(sec.source_class, d.source_class)
    LEFT JOIN research_company_facts lost ON lost.superseded_by = f.id AND lost.is_superseded
    LEFT JOIN research_documents lost_doc ON lost_doc.id = lost.source_document_id
    LEFT JOIN research_document_sections lost_sec ON lost_sec.id = lost.source_section_id
  WHERE f.is_superseded = false
    AND f.review_state <> 'retired';

CREATE OR REPLACE VIEW v_research_absences WITH (security_invoker = true) AS
  SELECT f.id,
    f.company_id,
    c.slug,
    f.subject,
    f.headline,
    f.detail,
    f.occurred_on,
    d.id AS source_document_id,
    d.title AS source_title,
    d.source_class,
    d.pdf_url AS source_url,
    d.published_at AS source_published_at,
    d.is_audited AS source_is_audited,
    f.review_state,
    f.ingest_run_id,
    f.changed_since_review
  FROM research_findings f
    JOIN research_companies c ON c.id = f.company_id
    JOIN research_documents d ON d.id = f.source_document_id
  WHERE f.is_absence = true
    AND f.is_suppressed = false
    AND f.review_state <> 'retired';


-- ------------------------------------------------------------
-- 4. The review queue lists changed records and rows too
-- ------------------------------------------------------------

CREATE OR REPLACE VIEW v_research_review_queue WITH (security_invoker = true) AS
  SELECT c.id AS company_id,
    c.slug,
    c.legal_name,
    c.tier,
    c.review_state AS company_review_state,
    (SELECT count(*) FROM treasury_events e
      WHERE e.company_id = c.id AND e.review_state = 'draft') AS draft_events,
    (SELECT count(*) FROM research_findings f
      WHERE f.company_id = c.id AND f.review_state = 'draft' AND f.is_suppressed = false) AS draft_findings,
    (SELECT count(*) FROM research_company_facts f
      WHERE f.company_id = c.id AND f.review_state = 'draft' AND f.is_superseded = false) AS draft_facts,
    c.changed_since_review AS company_changed_since_review,
    (SELECT count(*) FROM treasury_events e
      WHERE e.company_id = c.id AND e.changed_since_review) AS changed_events,
    (SELECT count(*) FROM research_findings f
      WHERE f.company_id = c.id AND f.changed_since_review AND f.is_suppressed = false) AS changed_findings,
    (SELECT count(*) FROM research_company_facts f
      WHERE f.company_id = c.id AND f.changed_since_review AND f.is_superseded = false) AS changed_facts
  FROM research_companies c
  WHERE c.review_state = 'draft'
     OR c.changed_since_review
     OR EXISTS (SELECT 1 FROM treasury_events e
                 WHERE e.company_id = c.id AND (e.review_state = 'draft' OR e.changed_since_review))
     OR EXISTS (SELECT 1 FROM research_findings f
                 WHERE f.company_id = c.id AND (f.review_state = 'draft' OR f.changed_since_review)
                   AND f.is_suppressed = false)
     OR EXISTS (SELECT 1 FROM research_company_facts f
                 WHERE f.company_id = c.id AND (f.review_state = 'draft' OR f.changed_since_review)
                   AND f.is_superseded = false);
