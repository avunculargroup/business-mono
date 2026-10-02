-- ============================================================
-- CORPORATE HOLDINGS — the ingest commits the filing item it read
-- Spec: docs/features/corporate-holdings/schema-ingest-spec.md
--       → Ingest workflow ("Item-aware EDGAR parsing")
--
-- The ingest now splits an SEC filing on its item headings, stores each item
-- in research_document_sections, and records on every event the item it was
-- read from. The gate already judges a claim by its section's class when one
-- is cited (20261001030000); until now commit_research_ingest never passed
-- one, so every ingested event was judged by its whole document's class.
--
-- 20260904000000's definition, unchanged except for source_section_id on the
-- treasury_events insert and its ON CONFLICT update. A re-ingest that reads
-- an event from a different item moves the citation with it.
-- ============================================================

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
      headline             = EXCLUDED.headline,
      detail               = EXCLUDED.detail,
      disclosure_venue     = EXCLUDED.disclosure_venue,
      filing_entity        = EXCLUDED.filing_entity,
      basis                = EXCLUDED.basis,
      source_document_id   = EXCLUDED.source_document_id,
      source_section_id    = EXCLUDED.source_section_id
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
      headline           = EXCLUDED.headline,
      detail             = EXCLUDED.detail,
      materiality        = EXCLUDED.materiality,
      is_suppressed      = EXCLUDED.is_suppressed,
      suppressed_reason  = EXCLUDED.suppressed_reason,
      event_id           = EXCLUDED.event_id,
      source_document_id = EXCLUDED.source_document_id
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
