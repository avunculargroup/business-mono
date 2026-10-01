-- ============================================================
-- CORPORATE HOLDINGS — rank by filing item, and per-field source sets
-- Spec: docs/features/corporate-holdings/schema-ingest-spec.md
--       → Decision 1, Decision 2, Decided (29 September)
--
-- The source gate compared one integer per document against one integer
-- per field. That conflated timeliness with reliability, and it measured
-- which filing system carried a claim rather than how reliable the claim
-- is: six claims across four records were refused from 10-Ks and 10-Qs,
-- while a one-bitcoin holding's custody was accepted from an RNS.
--
-- Three changes, landed together because each is meaningless alone:
--
-- 1. The vocabulary covers four filing systems. Two filed classes are
--    added and kept apart on purpose: `filed_financials` (10-Q statements
--    and notes — filed, reviewed, not audited) and `filed_narrative`
--    (10-K/10-Q Items 1–7, MD&A, the business description). The ledger
--    accepts the first and not the second, so a holding stated only in
--    10-K prose still cannot reach it. `investor_presentation` widens into
--    `furnished_release`, which is where furnished 8-K exhibits belong.
--    A foreign private issuer's 6-K is classed `exchange_announcement`:
--    furnished content ranks lower only where a filed channel exists for
--    the same disclosure, which is a classification rule applied at entry,
--    not something the gate can see.
--
-- 2. Each field carries a SET of accepted classes (`field_source_classes`)
--    instead of a minimum rank. `rank` survives as display order only.
--
-- 3. A filing is not uniform inside itself, so a claim may cite a section
--    (`research_document_sections`). The gate uses the section's class when
--    one is cited and the document's otherwise, so nothing stored breaks.
--
-- Every set below contains everything the old threshold admitted, so no
-- stored row can start failing; the check at the end proves it rather than
-- assuming it.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Source classes
-- ------------------------------------------------------------

-- min_source_rank is a foreign key onto source_classes(rank), so it has to
-- go before the ranks can move. Its replacement is section 2.
ALTER TABLE field_source_minimums DROP COLUMN IF EXISTS min_source_rank;

-- rank is UNIQUE and checked row by row, so renumbering goes via a range
-- nothing occupies.
UPDATE source_classes SET rank = rank + 100 WHERE rank < 100;

INSERT INTO source_classes (code, rank, label, is_audited) VALUES
  ('filed_financials',  4, 'Filed financial statements, reviewed not audited (10-Q statements and notes)', FALSE),
  ('filed_narrative',   5, 'Filed narrative (10-K/10-Q Items 1–7, MD&A, business description)',          FALSE),
  ('furnished_release', 6, 'Furnished release (8-K Exhibit 99, earnings release, investor presentation)', FALSE)
ON CONFLICT (code) DO NOTHING;

UPDATE research_documents SET source_class = 'furnished_release'
 WHERE source_class = 'investor_presentation';
DELETE FROM source_classes WHERE code = 'investor_presentation';

UPDATE source_classes SET
  rank = CASE code
    WHEN 'regulated_disclosure'  THEN 1
    WHEN 'exchange_announcement' THEN 2
    WHEN 'audited_accounts'      THEN 3
    WHEN 'company_web'           THEN 7
    WHEN 'secondary'             THEN 8
  END,
  label = CASE code
    WHEN 'regulated_disclosure'  THEN 'Regulated disclosure (PDS, prospectus, scheme booklet, 424B supplement)'
    WHEN 'exchange_announcement' THEN 'Exchange announcement (ASX/NZX/SGX, TDnet, RNS, SEDAR+ material change, filed 8-K item, 6-K)'
    WHEN 'audited_accounts'      THEN 'Audited financial statements (incl. 20-F)'
    ELSE label
  END
 WHERE rank > 100;

-- The forced fit the spec named: six 10-Qs registered as audited_accounts
-- with is_audited = false, because no class fitted a filed-but-unaudited
-- periodic report. A 10-Q is never audited, so the rule is structural
-- rather than a list of ids. The document class describes its principal
-- content; a claim drawn from its MD&A cites a filed_narrative section.
UPDATE research_documents SET source_class = 'filed_financials'
 WHERE source_class = 'audited_accounts'
   AND is_audited = FALSE
   AND title ILIKE 'Form 10-Q%';


-- ------------------------------------------------------------
-- 2. Accepted classes per field
--
-- field_source_minimums keeps its name, rationale and client_fact_class;
-- only the threshold moved here.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS field_source_classes (
  field_key    TEXT NOT NULL REFERENCES field_source_minimums(field_key) ON DELETE CASCADE,
  source_class TEXT NOT NULL REFERENCES source_classes(code),
  PRIMARY KEY (field_key, source_class)
);

COMMENT ON TABLE field_source_classes IS
  'The source classes each field accepts. A set, not a threshold: custody accepts filed '
  'narrative where the ledger does not, which no single rank can express.';

INSERT INTO field_source_classes (field_key, source_class)
SELECT f.field_key, c.source_class
  FROM (VALUES
    ('custody',              ARRAY['regulated_disclosure','exchange_announcement','audited_accounts','filed_financials','filed_narrative']),
    ('accounting_treatment', ARRAY['regulated_disclosure','exchange_announcement','audited_accounts','filed_financials']),
    ('mandate',              ARRAY['regulated_disclosure','exchange_announcement','audited_accounts','filed_financials','filed_narrative']),
    ('covenants',            ARRAY['regulated_disclosure','exchange_announcement','audited_accounts','filed_financials','filed_narrative']),
    ('ledger_event',         ARRAY['regulated_disclosure','exchange_announcement','audited_accounts','filed_financials']),
    ('operating_metric',     ARRAY['regulated_disclosure','exchange_announcement','audited_accounts','filed_financials','filed_narrative','furnished_release']),
    ('identity',             ARRAY['regulated_disclosure','exchange_announcement','audited_accounts','filed_financials','filed_narrative','furnished_release','company_web'])
  ) AS f(field_key, classes)
  CROSS JOIN LATERAL unnest(f.classes) AS c(source_class)
ON CONFLICT DO NOTHING;

ALTER TABLE field_source_classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "field_source_classes_team" ON field_source_classes;
CREATE POLICY "field_source_classes_team" ON field_source_classes
  FOR ALL USING (is_team_member());


-- ------------------------------------------------------------
-- 3. Sections
--
-- research_documents stays the retrieval unit — one URL, one fetch, one
-- full_text. A section carries the rankable claim: an 8-K's Item 8.01 is
-- filed while its Exhibit 99.1 is furnished, and both arrive in one file.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS research_document_sections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES research_documents(id) ON DELETE CASCADE,
  filing_item  TEXT NOT NULL,        -- '8-K Item 8.01', '10-K Item 1', '10-Q Note 3', 'RNS body'
  source_class TEXT NOT NULL REFERENCES source_classes(code),
  is_filed     BOOLEAN,              -- false for furnished 8-K exhibits
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, filing_item)
);

ALTER TABLE research_document_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "research_document_sections_team" ON research_document_sections;
CREATE POLICY "research_document_sections_team" ON research_document_sections
  FOR ALL USING (is_team_member());

ALTER TABLE research_company_facts
  ADD COLUMN IF NOT EXISTS source_section_id UUID REFERENCES research_document_sections(id);
ALTER TABLE treasury_events
  ADD COLUMN IF NOT EXISTS source_section_id UUID REFERENCES research_document_sections(id);
ALTER TABLE treasury_holdings_snapshots
  ADD COLUMN IF NOT EXISTS source_section_id UUID REFERENCES research_document_sections(id);


-- ------------------------------------------------------------
-- 4. The gate
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION assert_source_accepted(doc_id UUID, section_id UUID, target_field TEXT)
RETURNS VOID AS $$
DECLARE
  claim_class   TEXT;
  section_doc   UUID;
BEGIN
  IF section_id IS NOT NULL THEN
    SELECT s.document_id, s.source_class INTO section_doc, claim_class
      FROM research_document_sections s
     WHERE s.id = section_id;

    -- A section from another document would let a claim borrow a class
    -- its own document does not carry.
    IF section_doc IS DISTINCT FROM doc_id THEN
      RAISE EXCEPTION 'Section % does not belong to document %', section_id, doc_id;
    END IF;
  ELSE
    SELECT d.source_class INTO claim_class
      FROM research_documents d
     WHERE d.id = doc_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM field_source_minimums WHERE field_key = target_field) THEN
    RAISE EXCEPTION 'No field_source_minimums row for field %', target_field;
  END IF;

  IF claim_class IS NULL OR NOT EXISTS (
    SELECT 1 FROM field_source_classes
     WHERE field_key = target_field AND source_class = claim_class
  ) THEN
    RAISE EXCEPTION 'Source class % is not accepted for field %', claim_class, target_field;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_source_minimum()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM assert_source_accepted(NEW.source_document_id, NEW.source_section_id, TG_ARGV[0]);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_source_minimum_for_row()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM assert_source_accepted(NEW.source_document_id, NEW.source_section_id, NEW.field_key);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS assert_source_minimum(UUID, TEXT);


-- ------------------------------------------------------------
-- 5. Views — report the class the claim was admitted on
--
-- Column order is unchanged so CREATE OR REPLACE applies; source_filing_item
-- is appended, NULL wherever a claim cites the whole document.
-- ------------------------------------------------------------

CREATE OR REPLACE VIEW v_research_ledger AS
  SELECT
    e.id,
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
    END                          AS consideration_aud,
    fx.rate                      AS fx_rate_used,
    fx.rate_date                 AS fx_rate_date,
    e.headline,
    e.detail,
    e.basis,
    hb.comparable                AS basis_comparable,
    e.disclosure_venue,
    e.filing_entity,
    d.id                         AS source_document_id,
    d.title                      AS source_title,
    sc.code                      AS source_class,
    sc.rank                      AS source_rank,
    d.pdf_url                    AS source_url,
    d.published_at               AS source_published_at,
    d.is_audited                 AS source_is_audited,
    COALESCE(cl.classification, 'internal') AS classification,
    sec.filing_item              AS source_filing_item
  FROM treasury_events e
  JOIN research_companies c  ON c.id = e.company_id
  JOIN research_documents d  ON d.id = e.source_document_id
  LEFT JOIN research_document_sections sec ON sec.id = e.source_section_id
  JOIN source_classes sc     ON sc.code = COALESCE(sec.source_class, d.source_class)
  LEFT JOIN holding_bases hb ON hb.code = e.basis
  LEFT JOIN fx_rates fx
         ON fx.rate_date      = e.event_date
        AND fx.base_currency  = e.native_currency
        AND fx.quote_currency = 'AUD'
  LEFT JOIN research_classifications cl
         ON cl.subject_table = 'treasury_events'
        AND cl.subject_id    = e.id
        AND cl.field_key     = 'ledger_event';

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
    sec.filing_item     AS source_filing_item
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

CREATE OR REPLACE VIEW v_company_facts AS
  SELECT
    f.id,
    f.company_id,
    c.slug,
    f.field_key,
    f.label,
    f.value,
    f.as_of,
    d.id           AS source_document_id,
    d.title        AS source_title,
    sc.code        AS source_class,
    sc.rank        AS source_rank,
    d.pdf_url      AS source_url,
    d.published_at AS source_published_at,
    d.is_audited   AS source_is_audited,
    lost.value          AS conflicting_value,
    lost_doc.title      AS conflicting_source_title,
    COALESCE(lost_sec.source_class, lost_doc.source_class) AS conflicting_source_class,
    lost_doc.pdf_url    AS conflicting_source_url,
    sec.filing_item     AS source_filing_item
  FROM research_company_facts f
  JOIN research_companies c  ON c.id = f.company_id
  JOIN research_documents d  ON d.id = f.source_document_id
  LEFT JOIN research_document_sections sec ON sec.id = f.source_section_id
  JOIN source_classes sc     ON sc.code = COALESCE(sec.source_class, d.source_class)
  LEFT JOIN research_company_facts lost
         ON lost.superseded_by = f.id AND lost.is_superseded
  LEFT JOIN research_documents lost_doc
         ON lost_doc.id = lost.source_document_id
  LEFT JOIN research_document_sections lost_sec
         ON lost_sec.id = lost.source_section_id
  WHERE f.is_superseded = FALSE;


-- ------------------------------------------------------------
-- 6. Every stored claim still passes
--
-- The triggers fire on write, so a row admitted under the old ladder and
-- refused under the new sets would sit undetected until someone edited it.
-- Fail the migration instead.
-- ------------------------------------------------------------

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT source_document_id, source_section_id, field_key FROM research_company_facts WHERE NOT is_superseded
    UNION ALL
    SELECT source_document_id, source_section_id, 'ledger_event' FROM treasury_events
    UNION ALL
    SELECT source_document_id, source_section_id, 'ledger_event' FROM treasury_holdings_snapshots
  LOOP
    PERFORM assert_source_accepted(r.source_document_id, r.source_section_id, r.field_key);
  END LOOP;
END $$;
