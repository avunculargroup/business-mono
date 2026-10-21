-- ============================================================
-- CORPORATE HOLDINGS — the ingest writes facts
--
-- 20261021000000 added business_description and headcount so the subscriber
-- summary can say what a company does and how big it is. Until now nothing
-- but a person wrote facts; the ingest now reads both from the filings it
-- already fetches, in the same transaction as its events and findings.
--
--   - research_company_facts carries ingest_run_id, as treasury_events and
--     research_findings do, so approving a run on /research approves the
--     facts it wrote and nothing else. Hand-written facts carry none.
--   - ingest_run_id is not content to the change-since-review trigger, for
--     the same reason as on the other two tables.
--   - commit_research_ingest takes payload.facts. 20261004000000's
--     definition, with a facts loop added before classifications and a
--     `facts` tally in the result. See the loop for when a re-read sends a
--     fact back to draft.
--   - v_company_facts carries the column, appended. Restated
--     WITH (security_invoker = true), because CREATE OR REPLACE VIEW drops it.
-- ============================================================

ALTER TABLE research_company_facts ADD COLUMN IF NOT EXISTS ingest_run_id TEXT;

DROP TRIGGER IF EXISTS research_company_facts_content_updated_at ON research_company_facts;
CREATE TRIGGER research_company_facts_content_updated_at
  BEFORE UPDATE ON research_company_facts
  FOR EACH ROW EXECUTE FUNCTION stamp_content_updated_at(
    'id', 'created_at', 'updated_at', 'content_updated_at', 'changed_since_review',
    'review_state', 'reviewed_by', 'reviewed_at', 'ingest_run_id'
  );


-- ------------------------------------------------------------
-- 1. The view carries it (live definition, column appended)
-- ------------------------------------------------------------

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
    f.changed_since_review,
    f.ingest_run_id
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


-- ------------------------------------------------------------
-- 2. commit_research_ingest writes facts
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
  facts_inserted     INT  := 0;
  facts_updated      INT  := 0;
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
      source_section_id, ingest_run_id
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
      NULLIF(item->>'source_section_id', '')::UUID,
      NULLIF(payload->>'run_id', '')
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
        THEN NULL ELSE treasury_events.reviewed_at END,
      -- The run that last changed a fact owns the row's review: approving
      -- that run approves it. An unchanged re-read leaves it where it was.
      ingest_run_id        = CASE WHEN (treasury_events.event_type, treasury_events.asset_class, treasury_events.event_date,
       treasury_events.quantity, treasury_events.consideration_native,
       treasury_events.native_currency, treasury_events.fees_included, treasury_events.basis)
      IS DISTINCT FROM
      (EXCLUDED.event_type, EXCLUDED.asset_class, EXCLUDED.event_date,
       EXCLUDED.quantity, EXCLUDED.consideration_native,
       EXCLUDED.native_currency, EXCLUDED.fees_included, EXCLUDED.basis)
        THEN EXCLUDED.ingest_run_id ELSE treasury_events.ingest_run_id END
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
      source_document_id, natural_key, ingest_run_id
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
      item->>'natural_key',
      NULLIF(payload->>'run_id', '')
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
        THEN NULL ELSE research_findings.reviewed_at END,
      ingest_run_id      = CASE WHEN (research_findings.finding_type, research_findings.is_absence, research_findings.subject,
       research_findings.occurred_on, research_findings.materiality,
       research_findings.is_suppressed, research_findings.event_id)
      IS DISTINCT FROM
      (EXCLUDED.finding_type, EXCLUDED.is_absence, EXCLUDED.subject,
       EXCLUDED.occurred_on, EXCLUDED.materiality,
       EXCLUDED.is_suppressed, EXCLUDED.event_id)
        THEN EXCLUDED.ingest_run_id ELSE research_findings.ingest_run_id END
    RETURNING (xmax = 0) INTO was_insert;

    IF was_insert THEN findings_inserted := findings_inserted + 1;
    ELSE findings_updated := findings_updated + 1;
    END IF;
  END LOOP;

  -- Facts, from 20261022000000. A fact is its source: the document, the
  -- filing item and the date it is stated as of. The value is model-written
  -- for a business description, so it is reworded on every read, and a
  -- re-read from the same source keeps the reviewed wording and state. A
  -- new source takes the new text, goes back to draft, and belongs to this
  -- run. Superseding is left to a person, as before.
  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'facts', '[]'::jsonb))
  LOOP
    INSERT INTO research_company_facts (
      company_id, field_key, label, value, as_of, source_document_id,
      source_section_id, natural_key, ingest_run_id
    ) VALUES (
      company,
      item->>'field_key',
      item->>'label',
      item->>'value',
      NULLIF(item->>'as_of', '')::DATE,
      (item->>'source_document_id')::UUID,
      NULLIF(item->>'source_section_id', '')::UUID,
      item->>'natural_key',
      NULLIF(payload->>'run_id', '')
    )
    ON CONFLICT (company_id, natural_key) DO UPDATE SET
      label              = CASE WHEN (research_company_facts.field_key, research_company_facts.as_of,
       research_company_facts.source_document_id, research_company_facts.source_section_id)
      IS DISTINCT FROM
      (EXCLUDED.field_key, EXCLUDED.as_of, EXCLUDED.source_document_id, EXCLUDED.source_section_id)
        OR research_company_facts.review_state = 'draft'
        THEN EXCLUDED.label ELSE research_company_facts.label END,
      value              = CASE WHEN (research_company_facts.field_key, research_company_facts.as_of,
       research_company_facts.source_document_id, research_company_facts.source_section_id)
      IS DISTINCT FROM
      (EXCLUDED.field_key, EXCLUDED.as_of, EXCLUDED.source_document_id, EXCLUDED.source_section_id)
        OR research_company_facts.review_state = 'draft'
        THEN EXCLUDED.value ELSE research_company_facts.value END,
      field_key          = EXCLUDED.field_key,
      as_of              = EXCLUDED.as_of,
      source_document_id = EXCLUDED.source_document_id,
      source_section_id  = EXCLUDED.source_section_id,
      review_state       = CASE WHEN (research_company_facts.field_key, research_company_facts.as_of,
       research_company_facts.source_document_id, research_company_facts.source_section_id)
      IS DISTINCT FROM
      (EXCLUDED.field_key, EXCLUDED.as_of, EXCLUDED.source_document_id, EXCLUDED.source_section_id)
        THEN 'draft' ELSE research_company_facts.review_state END,
      reviewed_by        = CASE WHEN (research_company_facts.field_key, research_company_facts.as_of,
       research_company_facts.source_document_id, research_company_facts.source_section_id)
      IS DISTINCT FROM
      (EXCLUDED.field_key, EXCLUDED.as_of, EXCLUDED.source_document_id, EXCLUDED.source_section_id)
        THEN NULL ELSE research_company_facts.reviewed_by END,
      reviewed_at        = CASE WHEN (research_company_facts.field_key, research_company_facts.as_of,
       research_company_facts.source_document_id, research_company_facts.source_section_id)
      IS DISTINCT FROM
      (EXCLUDED.field_key, EXCLUDED.as_of, EXCLUDED.source_document_id, EXCLUDED.source_section_id)
        THEN NULL ELSE research_company_facts.reviewed_at END,
      ingest_run_id      = CASE WHEN (research_company_facts.field_key, research_company_facts.as_of,
       research_company_facts.source_document_id, research_company_facts.source_section_id)
      IS DISTINCT FROM
      (EXCLUDED.field_key, EXCLUDED.as_of, EXCLUDED.source_document_id, EXCLUDED.source_section_id)
        THEN EXCLUDED.ingest_run_id ELSE research_company_facts.ingest_run_id END
    RETURNING (xmax = 0) INTO was_insert;

    IF was_insert THEN facts_inserted := facts_inserted + 1;
    ELSE facts_updated := facts_updated + 1;
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
    'classifications', jsonb_build_object('inserted', classes_inserted,   'updated', classes_updated),
    'facts',           jsonb_build_object('inserted', facts_inserted,     'updated', facts_updated)
  );
END;
$$ LANGUAGE plpgsql;
