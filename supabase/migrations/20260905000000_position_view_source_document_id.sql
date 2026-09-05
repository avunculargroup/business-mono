-- v_company_position was the only provenance-bearing view that did not project
-- the document id it already joins on. The adapter selects the same provenance
-- block from all four views, so every read of a company position failed with
-- 42703 and the company page rendered its error boundary instead of the record.
--
-- Replaced rather than CREATE OR REPLACEd: that form can only append columns,
-- and source_document_id belongs at the head of the provenance block, where
-- v_research_ledger, v_research_absences and v_company_facts all carry it.
-- Nothing depends on this view, and the schema's default privileges re-grant
-- SELECT to anon and authenticated on creation.

DROP VIEW IF EXISTS v_company_position;

CREATE VIEW v_company_position AS
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
    d.source_class,
    d.pdf_url           AS source_url,
    d.published_at      AS source_published_at
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
  JOIN research_documents d ON d.id = s.source_document_id;
