-- ============================================================
-- CORPORATE HOLDINGS — the corporate research register
-- Spec:   docs/features/corporate-holdings/corporate-research-spec.md
-- DDL of record: this file. The spec ships a reference
-- corporate-research-schema.sql; where the two differ, the
-- differences are called out inline and in the spec's build notes.
--
-- A register of companies holding bitcoin on their balance sheet,
-- written for Australian CFOs. It states what was disclosed and
-- where it came from. It does not state what it was worth.
--
-- Three invariants the schema exists to protect:
--   1. No basis, no comparison. holding_bases.comparable decides
--      what may enter an aggregate; the views enforce it, not the
--      callers.
--   2. Source class is an ingest-time gate, enforced by trigger.
--      Custody, treatment, mandate, covenants and ledger events all
--      require an exchange announcement or better.
--   3. Ticker is never a key. Resolution runs on legal entity plus
--      registration number, with company_former_names and
--      company_listings as the lookup paths.
--
-- Depends on: team_members, update_updated_at(), pgvector.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LOOKUPS
--
-- Open vocabularies live in tables, not CHECK constraints, so
-- adding a value is an INSERT rather than a migration. Three
-- research records produced four `basis` values, each discovered
-- empirically; assume a fifth exists.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS holding_bases (
  code        TEXT    PRIMARY KEY,
  label       TEXT    NOT NULL,
  description TEXT    NOT NULL,
  comparable  BOOLEAN NOT NULL DEFAULT FALSE   -- may this basis enter an aggregate?
);

INSERT INTO holding_bases (code, label, description, comparable) VALUES
  ('direct_spot',             'Direct spot',              'Held directly by the entity, no intermediary vehicle',  TRUE),
  ('look_through',            'Look-through',             'Includes exposure via fund units or other vehicles',    FALSE),
  ('includes_customer_assets','Includes customer assets', 'Aggregate includes assets custodied for third parties', FALSE),
  ('stated_unreconciled',     'Stated, unreconciled',     'Issuer stated a figure with no determinable basis',     FALSE)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS source_classes (
  code       TEXT    PRIMARY KEY,
  rank       INT     NOT NULL UNIQUE,           -- 1 = strongest
  label      TEXT    NOT NULL,
  is_audited BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO source_classes (code, rank, label, is_audited) VALUES
  ('regulated_disclosure',  1, 'Regulated disclosure (PDS, prospectus, scheme booklet)', TRUE),
  ('exchange_announcement', 2, 'Exchange announcement (ASX/NZX/SGX, Appendix 4C/4E/4A)', FALSE),
  ('audited_accounts',      3, 'Audited financial statements',                           TRUE),
  ('investor_presentation', 4, 'Investor presentation (explicitly unaudited)',           FALSE),
  ('company_web',           5, 'Company website, IR or marketing page',                  FALSE),
  ('secondary',             6, 'News, trackers, commentary',                             FALSE)
ON CONFLICT (code) DO NOTHING;

-- Minimum acceptable source class per field, enforced by the trigger
-- in section 8 rather than by convention. This is the gate that would
-- have prevented the custody error: one company's About page claimed
-- self-custody with no counterparty risk, and its offer document named
-- a third-party custodian and listed custodian insolvency as a key risk.
CREATE TABLE IF NOT EXISTS field_source_minimums (
  field_key       TEXT PRIMARY KEY,
  min_source_rank INT  NOT NULL REFERENCES source_classes(rank),
  rationale       TEXT
);

INSERT INTO field_source_minimums (field_key, min_source_rank, rationale) VALUES
  ('custody',              2, 'Marketing copy claimed self-custody; the offer document named a third-party custodian'),
  ('accounting_treatment', 2, 'Investor decks state presentation conventions, not measurement bases'),
  ('mandate',              2, 'Policy terms must come from a filed or regulated document'),
  ('covenants',            2, 'Facility terms are only reliable from regulated disclosure'),
  ('ledger_event',         2, 'Secondary sources were wrong on first-purchase consideration by ~50%'),
  ('operating_metric',     4, 'Quarterly investor materials are acceptable, flagged unaudited'),
  ('identity',             5, 'Company web acceptable, flagged')
ON CONFLICT (field_key) DO NOTHING;


-- ------------------------------------------------------------
-- 2. COMPANIES
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS research_companies (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                     TEXT UNIQUE NOT NULL,           -- /research/[slug]
  legal_name               TEXT NOT NULL,

  -- Key material. `ticker` is deliberately absent: three research
  -- records produced six identifier changes between them, so tickers
  -- live in company_listings as display and search hints only.
  acn                      TEXT,
  abn                      TEXT,
  arbn                     TEXT,
  isin                     TEXT,
  lei                      TEXT,

  jurisdiction             TEXT NOT NULL,                  -- incorporation
  operational_hq           TEXT,

  primary_archetype        TEXT NOT NULL
    CHECK (primary_archetype IN ('treasury_allocation','treasury_company',
                                 'native_exposure','operational_integration')),
  -- Separate from primary_archetype on purpose. A company presenting as
  -- a bitcoin treasury company while operating a growing SaaS business
  -- is not a labelling problem; the divergence is the case study.
  self_described_archetype TEXT
    CHECK (self_described_archetype IN ('treasury_allocation','treasury_company',
                                        'native_exposure','operational_integration')),

  reporting_standard       TEXT
    CHECK (reporting_standard IN ('aasb','nz_ifrs','us_gaap','sfrs','ifrs','other')),
  functional_currency      TEXT,
  presentation_currency    TEXT,                           -- may differ from functional
  financial_year_end       TEXT,                           -- 'MM-DD'

  tier                     TEXT NOT NULL DEFAULT 'peer_shaped'
    CHECK (tier IN ('regional','peer_shaped','bellwether')),

  expected_disclosure_cadence TEXT NOT NULL DEFAULT 'quarterly'
    CHECK (expected_disclosure_cadence IN ('monthly','quarterly','episodic')),

  -- Peer-shape matching inputs, kept as columns so the criteria are
  -- adjustable and visible rather than editorial.
  market_cap_band          TEXT
    CHECK (market_cap_band IN ('micro','small','mid','large','mega')),
  funding_source           TEXT
    CHECK (funding_source IN ('operating_cash','equity_issuance','debt',
                              'business_line_gross_profit','balance_sheet','mixed')),

  curator_notes            TEXT,                           -- why this record exists, retrieval traps
  last_verified_at         TIMESTAMPTZ,
  is_published             BOOLEAN NOT NULL DEFAULT FALSE,

  created_by               UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS research_companies_updated_at ON research_companies;
CREATE TRIGGER research_companies_updated_at
  BEFORE UPDATE ON research_companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_rc_tier      ON research_companies(tier);
CREATE INDEX IF NOT EXISTS idx_rc_archetype ON research_companies(primary_archetype);
CREATE INDEX IF NOT EXISTS idx_rc_standard  ON research_companies(reporting_standard);

-- Entity resolution. Partial unique indexes so the many NULLs do not
-- collide: a company with no ARBN must not block the next one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rc_acn  ON research_companies(acn)  WHERE acn  IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rc_abn  ON research_companies(abn)  WHERE abn  IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rc_arbn ON research_companies(arbn) WHERE arbn IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rc_isin ON research_companies(isin) WHERE isin IS NOT NULL;


-- Former names. A table, not JSONB, because this is a lookup path
-- during ingest: a name-keyed search loses the most valuable document
-- on a page when it was filed under the previous name.
CREATE TABLE IF NOT EXISTS company_former_names (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES research_companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  used_from  DATE,
  used_to    DATE,
  note       TEXT,
  UNIQUE (company_id, name)
);
CREATE INDEX IF NOT EXISTS idx_cfn_name ON company_former_names(lower(name));


CREATE TABLE IF NOT EXISTS company_listings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES research_companies(id) ON DELETE CASCADE,
  venue         TEXT NOT NULL,                  -- 'asx','nzx','nyse','sgx'
  ticker        TEXT NOT NULL,                  -- display and search hint only
  -- Gates regional-register membership rather than annotating it. A
  -- CDI foreign exempt quotation is exempt from most listing rules,
  -- so including it in a regional register would be technically
  -- defensible and analytically worthless.
  listing_type  TEXT NOT NULL
    CHECK (listing_type IN ('primary','secondary','cdi_foreign_exempt')),
  filing_entity TEXT,                           -- which legal entity lodged here
  listed_from   DATE,
  listed_to     DATE,                           -- NULL = current
  note          TEXT,
  UNIQUE (company_id, venue, ticker, listed_from)
);
CREATE INDEX IF NOT EXISTS idx_cl_company ON company_listings(company_id);
CREATE INDEX IF NOT EXISTS idx_cl_ticker  ON company_listings(venue, ticker);


-- ------------------------------------------------------------
-- 3. DOCUMENTS
--
-- Document acquisition is the binding constraint, not discovery.
-- Every fact in the ledger traces to a row here by a NOT NULL FK.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS research_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES research_companies(id) ON DELETE CASCADE,

  document_type   TEXT NOT NULL
    CHECK (document_type IN ('offer_document','annual_report','half_year','quarterly_4c',
                             'appendix_4e','capital_notice','announcement','playbook',
                             'governance_statement','other')),
  source_class    TEXT NOT NULL REFERENCES source_classes(code),

  title           TEXT NOT NULL,
  venue           TEXT,
  announcement_id TEXT,                         -- resolves to the PDF URL
  pdf_url         TEXT,
  published_at    DATE,
  filing_entity   TEXT,

  is_audited      BOOLEAN NOT NULL DEFAULT FALSE,
  content_sha256  TEXT,                         -- dedupe on re-fetch
  full_text       TEXT,
  page_count      INT,
  retrieved_at    TIMESTAMPTZ,
  -- A failed fetch is recorded, never discarded. A document that 404s
  -- repeatedly is a signal, and a silent skip hides it.
  retrieval_error TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, venue, announcement_id)
);
CREATE INDEX IF NOT EXISTS idx_rd_company ON research_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_rd_class   ON research_documents(source_class);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rd_sha
  ON research_documents(content_sha256) WHERE content_sha256 IS NOT NULL;


-- Whole-document chunks, never section-keyed. One company disclosed
-- its AASB 138 revaluation election under "Accounting Treatment of
-- Bitcoin" inside the risk factors; four rounds of searching the
-- financial statements missed it. Chunk whole, retrieve by field
-- semantics.
CREATE TABLE IF NOT EXISTS document_chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES research_documents(id) ON DELETE CASCADE,
  chunk_index INT  NOT NULL,
  page_from   INT,
  page_to     INT,
  content     TEXT NOT NULL,
  embedding   VECTOR(1536),
  UNIQUE (document_id, chunk_index)
);
-- HNSW to match every other embedding index in the schema. The
-- reference DDL specified ivfflat with lists = 100, which needs rows
-- present at build time to produce useful lists and would be built
-- here against an empty table.
CREATE INDEX IF NOT EXISTS idx_dc_embedding
  ON document_chunks USING hnsw (embedding vector_cosine_ops);


-- ------------------------------------------------------------
-- 4. LEDGER
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS treasury_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES research_companies(id) ON DELETE CASCADE,

  event_type           TEXT NOT NULL
    CHECK (event_type IN ('policy_adoption','acquisition','disposal','capital_raise',
                          'covenant_change','capital_posture_change','custody_change',
                          'listing_change','accounting_election')),
  asset_class          TEXT NOT NULL DEFAULT 'btc',   -- not bitcoin-only: sol, tokenised treasuries, property
  event_date           DATE NOT NULL,

  quantity             NUMERIC(24,8),
  consideration_native NUMERIC(20,2),
  native_currency      TEXT,
  fees_included        BOOLEAN,                       -- a stated consideration may be fee-inclusive

  headline             TEXT NOT NULL,
  detail               TEXT,

  disclosure_venue     TEXT,
  filing_entity        TEXT,
  basis                TEXT REFERENCES holding_bases(code),

  source_document_id   UUID NOT NULL REFERENCES research_documents(id),

  -- Idempotency. The extractor emits a stable key so re-ingesting a
  -- document updates rather than duplicates.
  natural_key          TEXT NOT NULL,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, natural_key)
);

DROP TRIGGER IF EXISTS treasury_events_updated_at ON treasury_events;
CREATE TRIGGER treasury_events_updated_at
  BEFORE UPDATE ON treasury_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_te_company ON treasury_events(company_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_te_type    ON treasury_events(event_type);


CREATE TABLE IF NOT EXISTS treasury_holdings_snapshots (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  UUID NOT NULL REFERENCES research_companies(id) ON DELETE CASCADE,
  as_of_date                  DATE NOT NULL,

  asset                       TEXT NOT NULL DEFAULT 'btc',
  instrument_type             TEXT NOT NULL DEFAULT 'spot'
    CHECK (instrument_type IN ('spot','fund_units','spc_investment','tokenised_fund','other')),
  quantity                    NUMERIC(24,8) NOT NULL,

  -- NOT NULL, unlike treasury_events.basis. A holdings row without a
  -- basis is the exact bug rule 1 exists to prevent; an event without
  -- a quantity (a policy adoption, a covenant change) legitimately has
  -- no basis to state.
  basis                       TEXT NOT NULL REFERENCES holding_bases(code),
  look_through_btc_equivalent NUMERIC(24,8),
  is_related_party_vehicle    BOOLEAN NOT NULL DEFAULT FALSE,  -- units in a fund the issuer manages
  includes_customer_assets    BOOLEAN NOT NULL DEFAULT FALSE,  -- custodied for third parties

  value_native                NUMERIC(20,2),
  native_currency             TEXT,

  source_document_id          UUID NOT NULL REFERENCES research_documents(id),
  natural_key                 TEXT NOT NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, natural_key)
);
CREATE INDEX IF NOT EXISTS idx_ths_company
  ON treasury_holdings_snapshots(company_id, as_of_date DESC);


-- ------------------------------------------------------------
-- 5. FX
--
-- AUD is computed in a view, never stored on the event. A board paper
-- quoting a USD cost basis converted at an unstated rate gets sent back.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fx_rates (
  rate_date      DATE   NOT NULL,
  base_currency  TEXT   NOT NULL,
  quote_currency TEXT   NOT NULL DEFAULT 'AUD',
  rate           NUMERIC(18,8) NOT NULL,
  source         TEXT   NOT NULL,
  PRIMARY KEY (rate_date, base_currency, quote_currency)
);


-- ------------------------------------------------------------
-- 6. JURISDICTION NOTES
--
-- Keyed on standard, venue and listing type — never on company.
-- Written once, joined onto every record. This panel is the product.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jurisdiction_notes (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_key                TEXT UNIQUE NOT NULL,       -- 'aasb_138_revaluation', 'asx_lr_12_3'
  applies_to_standard     TEXT,
  applies_to_venue        TEXT,
  applies_to_listing_type TEXT,
  topic                   TEXT NOT NULL
    CHECK (topic IN ('accounting','tax','listing_rules','custody_licensing','disclosure')),
  title                   TEXT NOT NULL,
  body                    TEXT NOT NULL,              -- markdown
  rule_reference          TEXT,                       -- cite rule text, not commentary
  primary_source_url      TEXT,
  verified_at             DATE,
  is_published            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS jurisdiction_notes_updated_at ON jurisdiction_notes;
CREATE TRIGGER jurisdiction_notes_updated_at
  BEFORE UPDATE ON jurisdiction_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ------------------------------------------------------------
-- 7. COMPLIANCE CLASSIFICATION
--
-- Lex classifies per field, not per record. Promotion to a
-- client-facing surface is a hard gate in v_research_publishable,
-- not a review step someone remembers to do.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS research_classifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_table  TEXT NOT NULL,                  -- 'treasury_events', 'research_companies'
  subject_id     UUID NOT NULL,
  field_key      TEXT NOT NULL,

  classification TEXT NOT NULL DEFAULT 'internal'
    CHECK (classification IN ('publishable','internal','restricted')),
  reason         TEXT NOT NULL,
  classified_by  TEXT NOT NULL DEFAULT 'lex',
  classified_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  approved_by    UUID REFERENCES team_members(id) ON DELETE SET NULL,
  approved_at    TIMESTAMPTZ,

  UNIQUE (subject_table, subject_id, field_key)
);
CREATE INDEX IF NOT EXISTS idx_rcl_subject ON research_classifications(subject_table, subject_id);
CREATE INDEX IF NOT EXISTS idx_rcl_class   ON research_classifications(classification);


-- ------------------------------------------------------------
-- 7b. FINDINGS
--
-- Resolves the spec's open item. The existing findings engine
-- (finding_metric_config, finding_thresholds, market_reports) is
-- keyed on metric series for the daily market report and carries no
-- subject columns to hang a company finding from — so this is its own
-- table rather than a widening of that one. Both engines follow the
-- same rule: the deterministic payload commits before any narration,
-- so summary and materiality are nullable and a finding is valid, and
-- visible, with only its facts.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS research_findings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES research_companies(id) ON DELETE CASCADE,

  finding_type   TEXT NOT NULL
    CHECK (finding_type IN ('holdings_change','policy_change','covenant_change',
                            'capital_posture_change','custody_change','listing_change',
                            'accounting_election','structural_absence')),
  -- A structural absence is a stated fact, not an empty panel: a
  -- company with no debt at all reports "no financing facilities at
  -- quarter end, per Appendix 4C item 7.4".
  is_absence     BOOLEAN NOT NULL DEFAULT FALSE,
  -- Which panel an absence answers. Required on an absence, because an
  -- absence with no subject cannot be rendered anywhere and is
  -- indistinguishable from the empty panel it exists to replace.
  subject        TEXT
    CHECK (subject IN ('covenants','debt','holdings','policy')),

  occurred_on    DATE,
  headline       TEXT NOT NULL,
  detail         TEXT,
  materiality    NUMERIC(4,3),                  -- null until scored
  -- Deltas below 0.5% of the reference quantity are logged and
  -- suppressed: a restatement of shares on issue by 0.03% because
  -- buyback shares were not yet cancelled is administrative, not signal.
  is_suppressed  BOOLEAN NOT NULL DEFAULT FALSE,
  suppressed_reason TEXT,

  event_id       UUID REFERENCES treasury_events(id) ON DELETE CASCADE,
  source_document_id UUID REFERENCES research_documents(id) ON DELETE SET NULL,

  natural_key    TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, natural_key),

  -- An absence with no subject cannot be rendered anywhere and is
  -- indistinguishable from the empty panel it exists to replace; an
  -- absence with no document is a guess.
  CONSTRAINT research_findings_absence_has_subject
    CHECK (NOT is_absence OR subject IS NOT NULL),
  CONSTRAINT research_findings_absence_has_source
    CHECK (NOT is_absence OR source_document_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_rf_company ON research_findings(company_id, occurred_on DESC);


-- ------------------------------------------------------------
-- 7c. COMPANY FACTS
--
-- The qualitative fields — custody, mandate, accounting treatment,
-- covenants, operating metrics — each with the document that
-- establishes it.
--
-- A table rather than columns on research_companies for two reasons.
-- Every one of these fields is gated by field_source_minimums, and a
-- gate needs a source_document_id per fact rather than per row; and
-- the same field can be *claimed* by two documents that disagree,
-- which is the case the register exists to surface. A company's About
-- page claiming self-custody with no counterparty risk while its offer
-- document names a third-party custodian and lists custodian
-- insolvency as a key risk is not a data-quality problem to resolve
-- silently — it is the finding.
--
-- So the losing claim is stored too, with is_superseded set and
-- superseded_by pointing at the fact that beat it. Deleting it would
-- destroy the evidence that the gate did anything.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS research_company_facts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES research_companies(id) ON DELETE CASCADE,

  -- Must match a field_source_minimums row; the trigger below reads the
  -- minimum rank from it, so an unknown key raises rather than passing.
  field_key          TEXT NOT NULL REFERENCES field_source_minimums(field_key),
  label              TEXT NOT NULL,
  value              TEXT NOT NULL,             -- markdown
  as_of              DATE,

  source_document_id UUID NOT NULL REFERENCES research_documents(id),

  -- A claim that lost to a better-sourced one. Kept, not deleted.
  is_superseded      BOOLEAN NOT NULL DEFAULT FALSE,
  superseded_by      UUID REFERENCES research_company_facts(id) ON DELETE SET NULL,

  natural_key        TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, natural_key)
);

DROP TRIGGER IF EXISTS research_company_facts_updated_at ON research_company_facts;
CREATE TRIGGER research_company_facts_updated_at
  BEFORE UPDATE ON research_company_facts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_rcf_company ON research_company_facts(company_id, field_key);


-- ------------------------------------------------------------
-- 8. TRIGGER — SOURCE CLASS GATE
--
-- Rule 2, enforced. The ledger tables name their field key as a
-- trigger argument; research_company_facts carries a different key per
-- row, so it reads NEW.field_key instead. Both go through the same
-- assertion.
-- ------------------------------------------------------------

-- The assertion itself, shared by both trigger functions. Raising here
-- rather than in each one means the two paths cannot drift into
-- disagreeing about what "below the minimum" means.
CREATE OR REPLACE FUNCTION assert_source_minimum(doc_id UUID, target_field TEXT)
RETURNS VOID AS $$
DECLARE
  doc_rank INT;
  min_rank INT;
BEGIN
  SELECT sc.rank INTO doc_rank
    FROM research_documents d
    JOIN source_classes sc ON sc.code = d.source_class
   WHERE d.id = doc_id;

  SELECT fsm.min_source_rank INTO min_rank
    FROM field_source_minimums fsm
   WHERE fsm.field_key = target_field;

  IF min_rank IS NULL THEN
    RAISE EXCEPTION 'No field_source_minimums row for field %', target_field;
  END IF;

  IF doc_rank IS NULL OR doc_rank > min_rank THEN
    RAISE EXCEPTION
      'Source class rank % is below the minimum % required for field %',
      doc_rank, min_rank, target_field;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- For the ledger tables, whose field key is fixed per table and passed
-- as TG_ARGV[0].
CREATE OR REPLACE FUNCTION enforce_source_minimum()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM assert_source_minimum(NEW.source_document_id, TG_ARGV[0]);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- For research_company_facts, whose field key varies per row.
CREATE OR REPLACE FUNCTION enforce_source_minimum_for_row()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM assert_source_minimum(NEW.source_document_id, NEW.field_key);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS treasury_events_source_gate ON treasury_events;
CREATE TRIGGER treasury_events_source_gate
  BEFORE INSERT OR UPDATE ON treasury_events
  FOR EACH ROW EXECUTE FUNCTION enforce_source_minimum('ledger_event');

DROP TRIGGER IF EXISTS holdings_source_gate ON treasury_holdings_snapshots;
CREATE TRIGGER holdings_source_gate
  BEFORE INSERT OR UPDATE ON treasury_holdings_snapshots
  FOR EACH ROW EXECUTE FUNCTION enforce_source_minimum('ledger_event');

-- A superseded fact is evidence of the gate working, so it is exempt:
-- the About page claim has to be storable in order to be shown losing.
DROP TRIGGER IF EXISTS company_facts_source_gate ON research_company_facts;
CREATE TRIGGER company_facts_source_gate
  BEFORE INSERT OR UPDATE ON research_company_facts
  FOR EACH ROW WHEN (NEW.is_superseded = FALSE)
  EXECUTE FUNCTION enforce_source_minimum_for_row();


-- ------------------------------------------------------------
-- 9. VIEWS
-- ------------------------------------------------------------

-- The ledger with computed AUD and full provenance. consideration_aud
-- is NULL rather than wrong when no FX rate exists for the day — a
-- missing rate is a gap to fill, not a number to invent.
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
    d.source_class,
    sc.rank                      AS source_rank,
    d.pdf_url                    AS source_url,
    d.published_at               AS source_published_at,
    d.is_audited                 AS source_is_audited,
    COALESCE(cl.classification, 'internal') AS classification
  FROM treasury_events e
  JOIN research_companies c  ON c.id = e.company_id
  JOIN research_documents d  ON d.id = e.source_document_id
  JOIN source_classes sc     ON sc.code = d.source_class
  LEFT JOIN holding_bases hb ON hb.code = e.basis
  LEFT JOIN fx_rates fx
         ON fx.rate_date      = e.event_date
        AND fx.base_currency  = e.native_currency
        AND fx.quote_currency = 'AUD'
  LEFT JOIN research_classifications cl
         ON cl.subject_table = 'treasury_events'
        AND cl.subject_id    = e.id
        AND cl.field_key     = 'ledger_event';


-- The current position. Every row carries its basis and whether that
-- basis may be aggregated; nothing here sums across bases, because
-- the caller that wants a total has to say which rows it accepted.
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


-- Staleness measured against the issuer's own cadence, so the
-- quiet-day path does not report silence where silence is normal.
-- The same ninety days of nothing is unremarkable for an episodic
-- discloser and overdue for one that committed to monthly reporting.
CREATE OR REPLACE VIEW v_research_freshness AS
  SELECT
    c.id,
    c.slug,
    c.legal_name,
    c.tier,
    c.expected_disclosure_cadence,
    c.last_verified_at,
    MAX(d.published_at)                  AS latest_document_at,
    (CURRENT_DATE - MAX(d.published_at)) AS days_since_document,
    CASE c.expected_disclosure_cadence
      WHEN 'monthly'   THEN 45
      WHEN 'quarterly' THEN 135
      ELSE 240
    END                                  AS stale_after_days,
    COALESCE(
      (CURRENT_DATE - MAX(d.published_at)) >
        CASE c.expected_disclosure_cadence
          WHEN 'monthly'   THEN 45
          WHEN 'quarterly' THEN 135
          ELSE 240
        END,
      FALSE
    )                                    AS is_stale
  FROM research_companies c
  LEFT JOIN research_documents d
         ON d.company_id = c.id
        AND d.retrieval_error IS NULL
  GROUP BY c.id;


-- The only view a client-facing surface may read. Both gates apply:
-- the company is published AND Lex classified this field publishable.
CREATE OR REPLACE VIEW v_research_publishable AS
  SELECT l.*
  FROM v_research_ledger l
  JOIN research_companies c ON c.id = l.company_id
  WHERE c.is_published = TRUE
    AND l.classification = 'publishable';


-- Facts a record can state because they are missing. An empty covenant
-- panel and a company with no debt look identical on a screen, and only
-- one of them is an answer.
CREATE OR REPLACE VIEW v_research_absences AS
  SELECT
    f.id,
    f.company_id,
    c.slug,
    f.subject,
    f.headline,
    f.detail,
    f.occurred_on,
    d.id            AS source_document_id,
    d.title         AS source_title,
    d.source_class,
    d.pdf_url       AS source_url,
    d.published_at  AS source_published_at,
    d.is_audited    AS source_is_audited
  FROM research_findings f
  JOIN research_companies c ON c.id = f.company_id
  JOIN research_documents d ON d.id = f.source_document_id
  WHERE f.is_absence = TRUE
    AND f.is_suppressed = FALSE;


-- The qualitative panel, with the losing claim attached to the fact
-- that beat it. `conflicting_*` is non-null exactly where two documents
-- disagreed, which is what the custody panel renders.
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
    d.source_class,
    sc.rank        AS source_rank,
    d.pdf_url      AS source_url,
    d.published_at AS source_published_at,
    d.is_audited   AS source_is_audited,
    lost.value          AS conflicting_value,
    lost_doc.title      AS conflicting_source_title,
    lost_doc.source_class AS conflicting_source_class,
    lost_doc.pdf_url    AS conflicting_source_url
  FROM research_company_facts f
  JOIN research_companies c  ON c.id = f.company_id
  JOIN research_documents d  ON d.id = f.source_document_id
  JOIN source_classes sc     ON sc.code = d.source_class
  LEFT JOIN research_company_facts lost
         ON lost.superseded_by = f.id AND lost.is_superseded
  LEFT JOIN research_documents lost_doc
         ON lost_doc.id = lost.source_document_id
  WHERE f.is_superseded = FALSE;


-- ------------------------------------------------------------
-- 10. RLS
--
-- Two-person team: authenticated members read and write everything,
-- and the agent server writes as service_role. When the client-facing
-- surface arrives, its visibility is a NEW, NARROWER policy over
-- v_research_publishable — never a loosening of these.
-- ------------------------------------------------------------

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'holding_bases','source_classes','field_source_minimums',
    'research_companies','company_former_names','company_listings',
    'research_documents','document_chunks','treasury_events',
    'treasury_holdings_snapshots','fx_rates','jurisdiction_notes',
    'research_classifications','research_findings','research_company_facts'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL '
      'USING (auth.role() IN (''authenticated'', ''service_role'')) '
      'WITH CHECK (auth.role() IN (''authenticated'', ''service_role''))',
      t || '_all', t);
  END LOOP;
END $$;


-- ------------------------------------------------------------
-- 11. JURISDICTION NOTE SEEDS
--
-- Three notes, none of them company-specific. They are seeded here
-- rather than hand-entered because they are schema-shaped reference
-- text that every record joins onto, and because the ASX 12.3 note
-- resolves the question that blocked this build.
--
-- All three land unpublished. v1 is internal only; nothing reaches a
-- client-facing surface until a director approves it.
-- ------------------------------------------------------------

INSERT INTO jurisdiction_notes
  (note_key, applies_to_standard, applies_to_venue, applies_to_listing_type,
   topic, title, body, rule_reference, primary_source_url, verified_at, is_published)
VALUES
  (
    'aasb_138_revaluation', 'aasb', NULL, NULL, 'accounting',
    'AASB 138 and the revaluation model for bitcoin',
    E'Under Australian Accounting Standards bitcoin is generally an intangible asset. '
    'AASB 138 permits two measurement models after initial recognition: the cost model, '
    'and the revaluation model where fair value can be measured by reference to an active '
    'market. An issuer electing the revaluation model carries increases in other '
    'comprehensive income and accumulates them in a revaluation surplus, with decreases '
    'reversing that surplus before they reach profit or loss.\n\n'
    'Two things to check on any record, both learned the expensive way:\n\n'
    '1. **The election may not be in the financial statements.** One issuer disclosed its '
    'revaluation election under a heading about accounting treatment inside its risk '
    'factors. Four rounds of searching the statements missed it. Retrieve by field '
    'semantics, not by document section.\n'
    '2. **A presentation convention is not a measurement basis.** A quarterly investor '
    'deck marking bitcoin at spot and saying so is telling you how the deck is drawn, not '
    'which model the issuer elected. Treatment fields take an exchange announcement or '
    'better.',
    'AASB 138 Intangible Assets, paragraphs 72–87',
    'https://www.aasb.gov.au/admin/file/content105/c9/AASB138_08-15.pdf',
    NULL, FALSE
  ),
  (
    'us_gaap_asc_350_60', 'us_gaap', NULL, NULL, 'accounting',
    'ASC 350-60 — fair value through income for crypto assets',
    E'A US issuer reporting under US GAAP measures in-scope crypto assets at fair value, '
    'with changes recognised in net income each period, and presents crypto assets '
    'separately from other intangible assets on the balance sheet.\n\n'
    'This is why a US record and an Australian record cannot be read side by side on '
    'anything derived from carrying value. Under the revaluation model an increase '
    'accumulates in equity; under ASC 350-60 the same increase runs through income. The '
    'movement is the same, the reported earnings are not, and a comparison that does not '
    'say which standard applies is comparing two different questions.\n\n'
    'Separately, a headline crypto figure from a US issuer running a bitcoin business '
    'line may aggregate assets custodied for customers with assets held in treasury. '
    'That is a basis problem rather than a standards problem, and it is handled by '
    '`holding_bases`.',
    'FASB ASC 350-60 Crypto Assets (ASU 2023-08)',
    'https://www.fasb.org/page/PageContent?pageId=/reference-library/superseded-standards/accounting-standards-updates-issued.html',
    NULL, FALSE
  ),
  (
    'asx_lr_12_3', NULL, 'asx', NULL, 'listing_rules',
    'The two limbs of ASX Listing Rule 12.3',
    E'**Rule text.** If half or more of an entity''s total assets is cash or in a form '
    'readily convertible to cash, ASX may suspend quotation of the entity''s securities '
    'until it invests those assets or uses them for the entity''s business. The entity '
    'must give holders of ordinary securities written details of the investment or use. '
    'Stated exceptions are certain financial institutions, mining exploration entities '
    'and oil and gas exploration entities.\n\n'
    '**The second limb is the answer.** The rule is not a prohibition on holding liquid '
    'assets. It is a prohibition on holding them *uncommitted*. The test turns on whether '
    'the assets are being used for the entity''s business.\n\n'
    'An operating business — logistics software, say — holding bitcoin in treasury is not '
    'using that bitcoin for its business; it is holding uncommitted liquid assets. A '
    'digital asset funds manager holding digital assets in treasury under a stated '
    'investment framework is arguably doing exactly what its business does. Holding '
    'investments *is* the business.\n\n'
    '**Corroborating structure at admission.** The parallel commitments test in Listing '
    'Rule 1.3.2(b) applies to an entity that is **not an investment entity** — investment '
    'entities are carved out of the admission-stage test entirely. The ongoing rule has '
    'no equivalent express carve-out, which is why the analysis has to run through the '
    '"uses them for the entity''s business" limb rather than an exemption.\n\n'
    '**This also explains why two companies holding the same asset receive opposite '
    'questions.** One is asked to show the holding is part of its business. The other is '
    'asked to show its business is not a managed investment scheme. Same asset, same '
    'rule, opposite sides of the same test.\n\n'
    '**What transfers to an unlisted Australian company:** nothing directly. The Listing '
    'Rules bind listed entities. But the shape of the test does transfer, because '
    'financiers, auditors and insurers apply their own versions of it: a holding is '
    'assessed relative to the business it sits inside, and the question is always whether '
    'the asset is committed to something or merely parked.\n\n'
    '**Caution for the record.** This is an analysis of the rule as written and of the '
    'disclosed positions of the companies in this register. It is not a statement that '
    'ASX has formed any view about any particular entity under 12.3. Classify as internal '
    'until a director signs off.',
    'ASX Listing Rule 12.3; ASX Listing Rule 1.3.2(b)',
    'https://www.asx.com.au/regulation/rules-guidance-notes-and-waivers/asx-listing-rules-guidance-notes-and-waivers',
    NULL, FALSE
  )
ON CONFLICT (note_key) DO NOTHING;


-- ------------------------------------------------------------
-- 12. PERSIST — one transaction
--
-- The ingest workflow's `persist` step. It exists as an RPC because
-- PostgREST has no transactions: four sequential inserts from the
-- agent server can half-succeed, leaving events committed with the
-- classifications that gate them missing — which fails open, since an
-- unclassified field is internal but a *missing* classification on a
-- published company is a row nobody reviewed.
--
-- Every write is an upsert on the natural key, so re-ingesting the same
-- documents updates in place. The return value separates inserted from
-- updated (via the `xmax = 0` test, which is 0 only for a freshly
-- inserted tuple) because "commits zero new rows on a re-run" is the
-- acceptance criterion and "wrote nothing at all" is not the same
-- claim.
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
      disclosure_venue, filing_entity, basis, source_document_id, natural_key
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
      item->>'natural_key'
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
      source_document_id   = EXCLUDED.source_document_id
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
