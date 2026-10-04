-- ============================================================
-- CORPORATE HOLDINGS — the run that wrote a row
-- Spec: docs/features/corporate-holdings/schema-ingest-spec.md
--       → "Replace the suspend gate with a review queue"
--
-- 20261003220000 put review state on the rows. Approving still had to take
-- every draft row on a record at once, because nothing said which run had
-- written which row. treasury_events and research_findings now carry
-- ingest_run_id, the Mastra run id commit_research_ingest is called with, so
-- a reviewer can approve exactly what one run produced and nothing else.
--
--   - New rows take the run's id.
--   - A row whose facts a later run changes goes back to draft (as before)
--     and takes that run's id: the run that changed it owns its review.
--   - An unchanged re-read keeps the row's run id, state and wording.
--   - Rows written by hand carry no run id, and are approved as their own
--     group.
--
-- v_research_ledger and v_research_absences carry the column. Both are
-- restated WITH (security_invoker = true), because CREATE OR REPLACE VIEW
-- drops the option. research_company_facts gets no run id: the ingest does
-- not write facts.
-- ============================================================

ALTER TABLE treasury_events   ADD COLUMN IF NOT EXISTS ingest_run_id TEXT;
ALTER TABLE research_findings ADD COLUMN IF NOT EXISTS ingest_run_id TEXT;


-- ------------------------------------------------------------
-- 1. The views carry it (live definition, column appended)
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
    e.ingest_run_id
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
    f.ingest_run_id
  FROM research_findings f
    JOIN research_companies c ON c.id = f.company_id
    JOIN research_documents d ON d.id = f.source_document_id
  WHERE f.is_absence = true
    AND f.is_suppressed = false
    AND f.review_state <> 'retired';



-- ------------------------------------------------------------
-- 2. commit_research_ingest stamps it
--
-- 20261003220000's definition, unchanged except for ingest_run_id on the
-- treasury_events and research_findings inserts and their ON CONFLICT
-- updates. payload.run_id is optional: a call without one writes NULL, as a
-- hand-entered row would have.
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
