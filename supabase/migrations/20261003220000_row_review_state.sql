-- ============================================================
-- CORPORATE HOLDINGS — review state on the rows, not only the record
-- Spec: docs/features/corporate-holdings/schema-ingest-spec.md
--       → "Review state lives on the event as well as the company"
--
-- 20261003200000 put review_state on research_companies. A record-level flag
-- cannot say that one new event on a settled record is unread: either the
-- whole record drops back to draft, hiding everything because one row
-- arrived, or the row is served unreviewed. So treasury_events,
-- research_findings and research_company_facts each get their own
-- review_state, defaulting to draft, which is where anything an ingest or a
-- researcher writes now lands.
--
--   - Existing rows inherit their company's state, so nothing visible today
--     disappears.
--   - The client read policies check the row as well as the record: a draft
--     event on a cleared record never reaches a subscriber.
--   - v_research_publishable requires an internal row. The internal views
--     carry review_state and drop retired rows, which are kept in the tables
--     as the record of what was believed and when.
--   - v_research_review_queue lists every record with something waiting:
--     a draft record, or draft rows under a reviewed one.
--   - commit_research_ingest sends a row back to draft only when a fact in
--     it changed. Every run re-sends every validated event, so resetting on
--     any update would demote the whole ledger weekly.
--
-- Every view is restated WITH (security_invoker = true), because CREATE OR
-- REPLACE VIEW drops the option.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Columns, and the backfill from the company's state
-- ------------------------------------------------------------

ALTER TABLE treasury_events
  ADD COLUMN IF NOT EXISTS review_state TEXT NOT NULL DEFAULT 'draft' CHECK (review_state IN ('draft', 'internal', 'retired')),
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES team_members(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE research_findings
  ADD COLUMN IF NOT EXISTS review_state TEXT NOT NULL DEFAULT 'draft' CHECK (review_state IN ('draft', 'internal', 'retired')),
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES team_members(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE research_company_facts
  ADD COLUMN IF NOT EXISTS review_state TEXT NOT NULL DEFAULT 'draft' CHECK (review_state IN ('draft', 'internal', 'retired')),
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES team_members(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

UPDATE treasury_events e
   SET review_state = 'internal'
  FROM research_companies c
 WHERE c.id = e.company_id
   AND c.review_state = 'internal'
   AND e.review_state = 'draft';

UPDATE research_findings f
   SET review_state = 'internal'
  FROM research_companies c
 WHERE c.id = f.company_id
   AND c.review_state = 'internal'
   AND f.review_state = 'draft';

UPDATE research_company_facts f
   SET review_state = 'internal'
  FROM research_companies c
 WHERE c.id = f.company_id
   AND c.review_state = 'internal'
   AND f.review_state = 'draft';


-- ------------------------------------------------------------
-- 2. Client reads check the row as well as the record
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "treasury_events_client_read" ON treasury_events;
CREATE POLICY "treasury_events_client_read" ON treasury_events
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND review_state = 'internal'
    AND EXISTS (
      SELECT 1 FROM research_companies rc
      WHERE rc.id = treasury_events.company_id
        AND rc.review_state = 'internal'
        AND rc.client_cleared = TRUE
    )
  );

DROP POLICY IF EXISTS "research_company_facts_client_read" ON research_company_facts;
CREATE POLICY "research_company_facts_client_read" ON research_company_facts
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND review_state = 'internal'
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


-- ------------------------------------------------------------
-- 3. Views: review_state carried, retired rows dropped
--
-- Each is its live definition with review_state appended (CREATE OR REPLACE
-- can add a trailing column, never reorder one) and the retired filter added.
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
    e.review_state
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
    l.review_state
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
    f.review_state
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
    f.review_state
  FROM research_findings f
    JOIN research_companies c ON c.id = f.company_id
    JOIN research_documents d ON d.id = f.source_document_id
  WHERE f.is_absence = true
    AND f.is_suppressed = false
    AND f.review_state <> 'retired';


-- ------------------------------------------------------------
-- 4. The review queue: every record with something waiting
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
      WHERE f.company_id = c.id AND f.review_state = 'draft' AND f.is_superseded = false) AS draft_facts
  FROM research_companies c
  WHERE c.review_state = 'draft'
     OR EXISTS (SELECT 1 FROM treasury_events e
                 WHERE e.company_id = c.id AND e.review_state = 'draft')
     OR EXISTS (SELECT 1 FROM research_findings f
                 WHERE f.company_id = c.id AND f.review_state = 'draft' AND f.is_suppressed = false)
     OR EXISTS (SELECT 1 FROM research_company_facts f
                 WHERE f.company_id = c.id AND f.review_state = 'draft' AND f.is_superseded = false);


-- ------------------------------------------------------------
-- 5. commit_research_ingest: a changed fact goes back to draft
--
-- 20261002200000's definition, unchanged except for the CASE expressions in
-- the treasury_events and research_findings ON CONFLICT updates. New rows
-- need nothing: the column default puts them in draft.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION commit_research_ingest(payload JSONB)
RETURNS JSONB AS $$
DECLARE
  company            UUID := (payload->>'company_id')::UUID;
  events_inserted    INT  := 0;
  events_updated     INT  := 0;
  snapshots_inserted INT  := 0;
  snapshots_updated  INT  := 0;
  findings_inserted  INT  := 0;
  findings_updated   INT  := 0;
  classes_inserted   INT  := 0;
  classes_updated    INT  := 0;
  item               JSONB;
  was_insert         BOOLEAN;
  subject            UUID;
BEGIN
  IF company IS NULL THEN
    RAISE EXCEPTION 'commit_research_ingest: payload.company_id is required';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'events', '[]'::jsonb))
  LOOP
    INSERT INTO treasury_events (
      company_id, event_type, asset_class, event_date, quantity,
      consideration_native, native_currency, fees_included, headline, detail,
      disclosure_venue, filing_entity, basis, source_document_id, natural_key,
      source_section_id
    ) VALUES (
      company,
      item->>'event_type',
      COALESCE(item->>'asset_class', 'btc'),
      (item->>'event_date')::DATE,
      NULLIF(item->>'quantity', '')::NUMERIC,
      NULLIF(item->>'consideration_native', '')::NUMERIC,
      item->>'native_currency',
      NULLIF(item->>'fees_included', '')::BOOLEAN,
      item->>'headline',
      item->>'detail',
      item->>'disclosure_venue',
      item->>'filing_entity',
      item->>'basis',
      (item->>'source_document_id')::UUID,
      item->>'natural_key',
      NULLIF(item->>'source_section_id', '')::UUID
    )
    ON CONFLICT (company_id, natural_key) DO UPDATE SET
      event_type           = EXCLUDED.event_type,
      asset_class          = EXCLUDED.asset_class,
      event_date           = EXCLUDED.event_date,
      quantity             = EXCLUDED.quantity,
      consideration_native = EXCLUDED.consideration_native,
      native_currency      = EXCLUDED.native_currency,
      fees_included        = EXCLUDED.fees_included,
      -- Reviewed wording survives a re-read that changed no fact: the
      -- model rewords a headline on every run, and that rewording must not
      -- reach a subscriber unreviewed. A changed fact takes the new text and
      -- goes back to draft below.
      headline             = CASE WHEN (treasury_events.event_type, treasury_events.asset_class, treasury_events.event_date,
       treasury_events.quantity, treasury_events.consideration_native,
       treasury_events.native_currency, treasury_events.fees_included, treasury_events.basis)
      IS DISTINCT FROM
      (EXCLUDED.event_type, EXCLUDED.asset_class, EXCLUDED.event_date,
       EXCLUDED.quantity, EXCLUDED.consideration_native,
       EXCLUDED.native_currency, EXCLUDED.fees_included, EXCLUDED.basis)
        OR treasury_events.review_state = 'draft'
        THEN EXCLUDED.headline ELSE treasury_events.headline END,
      detail               = CASE WHEN (treasury_events.event_type, treasury_events.asset_class, treasury_events.event_date,
       treasury_events.quantity, treasury_events.consideration_native,
       treasury_events.native_currency, treasury_events.fees_included, treasury_events.basis)
      IS DISTINCT FROM
      (EXCLUDED.event_type, EXCLUDED.asset_class, EXCLUDED.event_date,
       EXCLUDED.quantity, EXCLUDED.consideration_native,
       EXCLUDED.native_currency, EXCLUDED.fees_included, EXCLUDED.basis)
        OR treasury_events.review_state = 'draft'
        THEN EXCLUDED.detail ELSE treasury_events.detail END,
      disclosure_venue     = EXCLUDED.disclosure_venue,
      filing_entity        = EXCLUDED.filing_entity,
      basis                = EXCLUDED.basis,
      source_document_id   = EXCLUDED.source_document_id,
      source_section_id    = EXCLUDED.source_section_id,
      -- A changed fact needs reading again; an unchanged re-read keeps
      -- whatever state a person gave the row, retired included.
      review_state         = CASE WHEN (treasury_events.event_type, treasury_events.asset_class, treasury_events.event_date,
       treasury_events.quantity, treasury_events.consideration_native,
       treasury_events.native_currency, treasury_events.fees_included, treasury_events.basis)
      IS DISTINCT FROM
      (EXCLUDED.event_type, EXCLUDED.asset_class, EXCLUDED.event_date,
       EXCLUDED.quantity, EXCLUDED.consideration_native,
       EXCLUDED.native_currency, EXCLUDED.fees_included, EXCLUDED.basis)
        THEN 'draft' ELSE treasury_events.review_state END,
      reviewed_by          = CASE WHEN (treasury_events.event_type, treasury_events.asset_class, treasury_events.event_date,
       treasury_events.quantity, treasury_events.consideration_native,
       treasury_events.native_currency, treasury_events.fees_included, treasury_events.basis)
      IS DISTINCT FROM
      (EXCLUDED.event_type, EXCLUDED.asset_class, EXCLUDED.event_date,
       EXCLUDED.quantity, EXCLUDED.consideration_native,
       EXCLUDED.native_currency, EXCLUDED.fees_included, EXCLUDED.basis)
        THEN NULL ELSE treasury_events.reviewed_by END,
      reviewed_at          = CASE WHEN (treasury_events.event_type, treasury_events.asset_class, treasury_events.event_date,
       treasury_events.quantity, treasury_events.consideration_native,
       treasury_events.native_currency, treasury_events.fees_included, treasury_events.basis)
      IS DISTINCT FROM
      (EXCLUDED.event_type, EXCLUDED.asset_class, EXCLUDED.event_date,
       EXCLUDED.quantity, EXCLUDED.consideration_native,
       EXCLUDED.native_currency, EXCLUDED.fees_included, EXCLUDED.basis)
        THEN NULL ELSE treasury_events.reviewed_at END
    RETURNING (xmax = 0) INTO was_insert;

    IF was_insert THEN events_inserted := events_inserted + 1;
    ELSE events_updated := events_updated + 1;
    END IF;
  END LOOP;

  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'snapshots', '[]'::jsonb))
  LOOP
    INSERT INTO treasury_holdings_snapshots (
      company_id, as_of_date, asset, instrument_type, quantity, basis,
      look_through_btc_equivalent, is_related_party_vehicle,
      includes_customer_assets, value_native, native_currency,
      source_document_id, natural_key
    ) VALUES (
      company,
      (item->>'as_of_date')::DATE,
      COALESCE(item->>'asset', 'btc'),
      COALESCE(item->>'instrument_type', 'spot'),
      (item->>'quantity')::NUMERIC,
      item->>'basis',
      NULLIF(item->>'look_through_btc_equivalent', '')::NUMERIC,
      COALESCE(NULLIF(item->>'is_related_party_vehicle', '')::BOOLEAN, FALSE),
      COALESCE(NULLIF(item->>'includes_customer_assets', '')::BOOLEAN, FALSE),
      NULLIF(item->>'value_native', '')::NUMERIC,
      item->>'native_currency',
      (item->>'source_document_id')::UUID,
      item->>'natural_key'
    )
    ON CONFLICT (company_id, natural_key) DO UPDATE SET
      as_of_date                  = EXCLUDED.as_of_date,
      asset                       = EXCLUDED.asset,
      instrument_type             = EXCLUDED.instrument_type,
      quantity                    = EXCLUDED.quantity,
      basis                       = EXCLUDED.basis,
      look_through_btc_equivalent = EXCLUDED.look_through_btc_equivalent,
      is_related_party_vehicle    = EXCLUDED.is_related_party_vehicle,
      includes_customer_assets    = EXCLUDED.includes_customer_assets,
      value_native                = EXCLUDED.value_native,
      native_currency             = EXCLUDED.native_currency,
      source_document_id          = EXCLUDED.source_document_id
    RETURNING (xmax = 0) INTO was_insert;

    IF was_insert THEN snapshots_inserted := snapshots_inserted + 1;
    ELSE snapshots_updated := snapshots_updated + 1;
    END IF;
  END LOOP;

  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'findings', '[]'::jsonb))
  LOOP
    -- A finding may point at an event this same call just wrote, so the
    -- event is addressed by its natural key rather than by an id the
    -- caller could not have known.
    subject := NULL;
    IF item ? 'event_natural_key' THEN
      SELECT e.id INTO subject FROM treasury_events e
       WHERE e.company_id = company AND e.natural_key = item->>'event_natural_key';
    END IF;

    INSERT INTO research_findings (
      company_id, finding_type, is_absence, subject, occurred_on, headline,
      detail, materiality, is_suppressed, suppressed_reason, event_id,
      source_document_id, natural_key
    ) VALUES (
      company,
      item->>'finding_type',
      COALESCE(NULLIF(item->>'is_absence', '')::BOOLEAN, FALSE),
      item->>'subject',
      NULLIF(item->>'occurred_on', '')::DATE,
      item->>'headline',
      item->>'detail',
      NULLIF(item->>'materiality', '')::NUMERIC,
      COALESCE(NULLIF(item->>'is_suppressed', '')::BOOLEAN, FALSE),
      item->>'suppressed_reason',
      subject,
      NULLIF(item->>'source_document_id', '')::UUID,
      item->>'natural_key'
    )
    ON CONFLICT (company_id, natural_key) DO UPDATE SET
      finding_type       = EXCLUDED.finding_type,
      is_absence         = EXCLUDED.is_absence,
      subject            = EXCLUDED.subject,
      occurred_on        = EXCLUDED.occurred_on,
      headline           = CASE WHEN (research_findings.finding_type, research_findings.is_absence, research_findings.subject,
       research_findings.occurred_on, research_findings.materiality,
       research_findings.is_suppressed, research_findings.event_id)
      IS DISTINCT FROM
      (EXCLUDED.finding_type, EXCLUDED.is_absence, EXCLUDED.subject,
       EXCLUDED.occurred_on, EXCLUDED.materiality,
       EXCLUDED.is_suppressed, EXCLUDED.event_id)
        OR research_findings.review_state = 'draft'
        THEN EXCLUDED.headline ELSE research_findings.headline END,
      detail             = CASE WHEN (research_findings.finding_type, research_findings.is_absence, research_findings.subject,
       research_findings.occurred_on, research_findings.materiality,
       research_findings.is_suppressed, research_findings.event_id)
      IS DISTINCT FROM
      (EXCLUDED.finding_type, EXCLUDED.is_absence, EXCLUDED.subject,
       EXCLUDED.occurred_on, EXCLUDED.materiality,
       EXCLUDED.is_suppressed, EXCLUDED.event_id)
        OR research_findings.review_state = 'draft'
        THEN EXCLUDED.detail ELSE research_findings.detail END,
      materiality        = EXCLUDED.materiality,
      is_suppressed      = EXCLUDED.is_suppressed,
      suppressed_reason  = EXCLUDED.suppressed_reason,
      event_id           = EXCLUDED.event_id,
      source_document_id = EXCLUDED.source_document_id,
      review_state       = CASE WHEN (research_findings.finding_type, research_findings.is_absence, research_findings.subject,
       research_findings.occurred_on, research_findings.materiality,
       research_findings.is_suppressed, research_findings.event_id)
      IS DISTINCT FROM
      (EXCLUDED.finding_type, EXCLUDED.is_absence, EXCLUDED.subject,
       EXCLUDED.occurred_on, EXCLUDED.materiality,
       EXCLUDED.is_suppressed, EXCLUDED.event_id)
        THEN 'draft' ELSE research_findings.review_state END,
      reviewed_by        = CASE WHEN (research_findings.finding_type, research_findings.is_absence, research_findings.subject,
       research_findings.occurred_on, research_findings.materiality,
       research_findings.is_suppressed, research_findings.event_id)
      IS DISTINCT FROM
      (EXCLUDED.finding_type, EXCLUDED.is_absence, EXCLUDED.subject,
       EXCLUDED.occurred_on, EXCLUDED.materiality,
       EXCLUDED.is_suppressed, EXCLUDED.event_id)
        THEN NULL ELSE research_findings.reviewed_by END,
      reviewed_at        = CASE WHEN (research_findings.finding_type, research_findings.is_absence, research_findings.subject,
       research_findings.occurred_on, research_findings.materiality,
       research_findings.is_suppressed, research_findings.event_id)
      IS DISTINCT FROM
      (EXCLUDED.finding_type, EXCLUDED.is_absence, EXCLUDED.subject,
       EXCLUDED.occurred_on, EXCLUDED.materiality,
       EXCLUDED.is_suppressed, EXCLUDED.event_id)
        THEN NULL ELSE research_findings.reviewed_at END
    RETURNING (xmax = 0) INTO was_insert;

    IF was_insert THEN findings_inserted := findings_inserted + 1;
    ELSE findings_updated := findings_updated + 1;
    END IF;
  END LOOP;

  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'classifications', '[]'::jsonb))
  LOOP
    subject := NULLIF(item->>'subject_id', '')::UUID;
    IF subject IS NULL AND item ? 'event_natural_key' THEN
      SELECT e.id INTO subject FROM treasury_events e
       WHERE e.company_id = company AND e.natural_key = item->>'event_natural_key';
    END IF;
    IF subject IS NULL THEN
      RAISE EXCEPTION
        'commit_research_ingest: classification for field % names no resolvable subject',
        item->>'field_key';
    END IF;

    INSERT INTO research_classifications (
      subject_table, subject_id, field_key, classification, reason, classified_by
    ) VALUES (
      COALESCE(item->>'subject_table', 'treasury_events'),
      subject,
      item->>'field_key',
      COALESCE(item->>'classification', 'internal'),
      item->>'reason',
      COALESCE(item->>'classified_by', 'lex')
    )
    ON CONFLICT (subject_table, subject_id, field_key) DO UPDATE SET
      classification = EXCLUDED.classification,
      reason         = EXCLUDED.reason,
      classified_by  = EXCLUDED.classified_by,
      classified_at  = NOW(),
      -- A re-classification drops any prior approval: a director
      -- approved the old wording, not this one.
      approved_by    = NULL,
      approved_at    = NULL
    RETURNING (xmax = 0) INTO was_insert;

    IF was_insert THEN classes_inserted := classes_inserted + 1;
    ELSE classes_updated := classes_updated + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'events',          jsonb_build_object('inserted', events_inserted,    'updated', events_updated),
    'snapshots',       jsonb_build_object('inserted', snapshots_inserted, 'updated', snapshots_updated),
    'findings',        jsonb_build_object('inserted', findings_inserted,  'updated', findings_updated),
    'classifications', jsonb_build_object('inserted', classes_inserted,   'updated', classes_updated)
  );
END;
$$ LANGUAGE plpgsql;
