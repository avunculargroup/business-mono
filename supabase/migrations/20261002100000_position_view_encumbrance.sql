-- ============================================================
-- CORPORATE HOLDINGS — encumbrance on the position view
-- Spec: docs/features/corporate-holdings/schema-ingest-spec.md
--       → Conformance cases (encumberedPortionExcludedFromFreeBalance)
--
-- 20261001100100 added encumbered_quantity, encumbrance_counterparty and
-- encumbrance_obligation to treasury_holdings_snapshots; the view the adapter
-- reads never selected them, so a pledge could be stored and not shown.
--
-- The definition is 20261001030000's, unchanged, with the three columns
-- appended: CREATE OR REPLACE VIEW may add columns only at the end.
-- ============================================================

CREATE OR REPLACE VIEW v_company_position AS
  SELECT
    c.id                AS company_id,
    c.slug,
    c.legal_name,
    c.primary_archetype,
    s.id                AS snapshot_id,
    s.as_of_date,
    s.asset,
    s.instrument_type,
    s.quantity,
    s.basis,
    hb.comparable       AS basis_comparable,
    s.look_through_btc_equivalent,
    s.is_related_party_vehicle,
    s.includes_customer_assets,
    d.id                AS source_document_id,
    d.title             AS source_title,
    COALESCE(sec.source_class, d.source_class) AS source_class,
    d.pdf_url           AS source_url,
    d.published_at      AS source_published_at,
    sec.filing_item     AS source_filing_item,
    s.encumbered_quantity,
    s.encumbrance_counterparty,
    s.encumbrance_obligation
  FROM research_companies c
  JOIN LATERAL (
    SELECT t.*
      FROM treasury_holdings_snapshots t
     WHERE t.company_id = c.id
       AND t.as_of_date = (
             SELECT MAX(t2.as_of_date)
               FROM treasury_holdings_snapshots t2
              WHERE t2.company_id = c.id
           )
  ) s ON TRUE
  JOIN holding_bases hb     ON hb.code = s.basis
  JOIN research_documents d ON d.id = s.source_document_id
  LEFT JOIN research_document_sections sec ON sec.id = s.source_section_id;
