-- ============================================================
-- CORPORATE RESEARCH — SCHEMA
-- Bitcoin Treasury Solutions internal platform
-- Depends on: team_members (existing)
-- Run in order. Idempotent where practical.
-- ============================================================

-- ============================================================
-- 1. LOOKUPS
-- Open vocabularies live in tables, not CHECK constraints, so
-- adding a value is an INSERT rather than a migration. Three
-- dossiers produced four `basis` values, each discovered
-- empirically; assume a fifth exists.
-- ============================================================

CREATE TABLE holding_bases (
  code        TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT NOT NULL,
  comparable  BOOLEAN NOT NULL DEFAULT FALSE   -- may this basis enter an aggregate?
);

INSERT INTO holding_bases (code, label, description, comparable) VALUES
  ('direct_spot',             'Direct spot',              'Held directly by the entity, no intermediary vehicle', TRUE),
  ('look_through',            'Look-through',             'Includes exposure via fund units or other vehicles',   FALSE),
  ('includes_customer_assets','Includes customer assets', 'Aggregate includes assets custodied for third parties', FALSE),
  ('stated_unreconciled',     'Stated, unreconciled',     'Issuer stated a figure with no determinable basis',    FALSE);

CREATE TABLE source_classes (
  code        TEXT PRIMARY KEY,
  rank        INT  NOT NULL UNIQUE,             -- 1 = strongest
  label       TEXT NOT NULL,
  is_audited  BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO source_classes (code, rank, label, is_audited) VALUES
  ('regulated_disclosure',  1, 'Regulated disclosure (PDS, prospectus, scheme booklet)', TRUE),
  ('exchange_announcement', 2, 'Exchange announcement (ASX/NZX/SGX, Appendix 4C/4E/4A)', FALSE),
  ('audited_accounts',      3, 'Audited financial statements',                           TRUE),
  ('investor_presentation', 4, 'Investor presentation (explicitly unaudited)',           FALSE),
  ('company_web',           5, 'Company website, IR or marketing page',                  FALSE),
  ('secondary',             6, 'News, trackers, commentary',                             FALSE);

-- Minimum acceptable source class per field. Enforced by trigger
-- below, not by convention. This is the gate that would have
-- prevented the custody error in dossier revision 2.
CREATE TABLE field_source_minimums (
  field_key         TEXT PRIMARY KEY,
  min_source_rank   INT NOT NULL REFERENCES source_classes(rank),
  rationale         TEXT
);

INSERT INTO field_source_minimums (field_key, min_source_rank, rationale) VALUES
  ('custody',              2, 'Marketing copy claimed self-custody; the offer document named a third-party custodian'),
  ('accounting_treatment', 2, 'Investor decks state presentation conventions, not measurement bases'),
  ('mandate',              2, 'Policy terms must come from a filed or regulated document'),
  ('covenants',            2, 'Facility terms are only reliable from regulated disclosure'),
  ('ledger_event',         2, 'Secondary sources were wrong on first-purchase consideration by ~50%'),
  ('operating_metric',     4, 'Quarterly investor materials are acceptable, flagged unaudited'),
  ('identity',             5, 'Company web acceptable, flagged');


-- ============================================================
-- 2. COMPANIES
-- ============================================================

CREATE TABLE research_companies (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                      TEXT UNIQUE NOT NULL,          -- /research/[slug]
  legal_name                TEXT NOT NULL,

  -- Key material. `ticker` is never a key: three records produced
  -- six identifier changes between them.
  acn                       TEXT,
  abn                       TEXT,
  arbn                      TEXT,
  isin                      TEXT,
  lei                       TEXT,

  jurisdiction              TEXT NOT NULL,                 -- incorporation
  operational_hq            TEXT,

  primary_archetype         TEXT NOT NULL
    CHECK (primary_archetype IN ('treasury_allocation','treasury_company',
                                 'native_exposure','operational_integration')),
  self_described_archetype  TEXT
    CHECK (self_described_archetype IN ('treasury_allocation','treasury_company',
                                        'native_exposure','operational_integration')),

  reporting_standard        TEXT
    CHECK (reporting_standard IN ('aasb','nz_ifrs','us_gaap','sfrs','ifrs','other')),
  functional_currency       TEXT,                          -- Locate: AUD
  presentation_currency     TEXT,                          -- Locate: NZD
  financial_year_end        TEXT,                          -- 'MM-DD'

  tier                      TEXT NOT NULL DEFAULT 'peer_shaped'
    CHECK (tier IN ('regional','peer_shaped','bellwether')),

  expected_disclosure_cadence TEXT NOT NULL DEFAULT 'quarterly'
    CHECK (expected_disclosure_cadence IN ('monthly','quarterly','episodic')),

  -- Peer-shape matching inputs. Kept explicit so the criteria are
  -- adjustable and visible rather than editorial.
  market_cap_band           TEXT
    CHECK (market_cap_band IN ('micro','small','mid','large','mega')),
  funding_source            TEXT
    CHECK (funding_source IN ('operating_cash','equity_issuance','debt',
                              'business_line_gross_profit','balance_sheet','mixed')),

  curator_notes             TEXT,                          -- why this record exists, retrieval traps
  last_verified_at          TIMESTAMPTZ,
  is_published              BOOLEAN NOT NULL DEFAULT FALSE,

  created_by                UUID REFERENCES team_members(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER research_companies_updated_at
  BEFORE UPDATE ON research_companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_rc_tier       ON research_companies(tier);
CREATE INDEX idx_rc_archetype  ON research_companies(primary_archetype);
CREATE INDEX idx_rc_standard   ON research_companies(reporting_standard);
-- Entity resolution: partial unique indexes tolerate NULLs
CREATE UNIQUE INDEX idx_rc_acn  ON research_companies(acn)  WHERE acn  IS NOT NULL;
CREATE UNIQUE INDEX idx_rc_arbn ON research_companies(arbn) WHERE arbn IS NOT NULL;
CREATE UNIQUE INDEX idx_rc_isin ON research_companies(isin) WHERE isin IS NOT NULL;


-- Former names. A table, not JSONB: this is a lookup path during
-- ingest. A name-keyed search loses Locate's Treasury Management
-- Policy because it was filed under Zoom2u.
CREATE TABLE company_former_names (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES research_companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  used_from   DATE,
  used_to     DATE,
  note        TEXT,
  UNIQUE (company_id, name)
);
CREATE INDEX idx_cfn_name ON company_former_names(lower(name));


CREATE TABLE company_listings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES research_companies(id) ON DELETE CASCADE,
  venue         TEXT NOT NULL,                   -- 'asx','nzx','nyse','sgx'
  ticker        TEXT NOT NULL,                   -- display and search hint only
  listing_type  TEXT NOT NULL
    CHECK (listing_type IN ('primary','secondary','cdi_foreign_exempt')),
  filing_entity TEXT,                            -- which legal entity lodged here
  listed_from   DATE,
  listed_to     DATE,                            -- NULL = current
  note          TEXT,
  UNIQUE (company_id, venue, ticker, listed_from)
);
CREATE INDEX idx_cl_company ON company_listings(company_id);
CREATE INDEX idx_cl_ticker  ON company_listings(venue, ticker);


-- ============================================================
-- 3. DOCUMENTS
-- The document layer is the binding constraint, not discovery.
-- Every fact traces to a row here.
-- ============================================================

CREATE TABLE research_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES research_companies(id) ON DELETE CASCADE,

  document_type   TEXT NOT NULL
    CHECK (document_type IN ('offer_document','annual_report','half_year','quarterly_4c',
                             'appendix_4e','capital_notice','announcement','playbook',
                             'governance_statement','other')),
  source_class    TEXT NOT NULL REFERENCES source_classes(code),

  title           TEXT NOT NULL,
  venue           TEXT,
  announcement_id TEXT,                          -- resolves to the PDF URL
  pdf_url         TEXT,
  published_at    DATE,
  filing_entity   TEXT,

  is_audited      BOOLEAN NOT NULL DEFAULT FALSE,
  content_sha256  TEXT,                          -- dedupe on re-fetch
  full_text       TEXT,
  page_count      INT,
  retrieved_at    TIMESTAMPTZ,
  retrieval_error TEXT,                          -- non-null = fetch failed, keep the attempt

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, venue, announcement_id)
);
CREATE INDEX idx_rd_company ON research_documents(company_id);
CREATE INDEX idx_rd_class   ON research_documents(source_class);
CREATE UNIQUE INDEX idx_rd_sha ON research_documents(content_sha256) WHERE content_sha256 IS NOT NULL;


-- Whole-document chunks. Never section-keyed: Locate disclosed its
-- AASB 138 election under "Accounting Treatment of Bitcoin" in the
-- risk factors, not the financial statements.
CREATE TABLE document_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES research_documents(id) ON DELETE CASCADE,
  chunk_index   INT NOT NULL,
  page_from     INT,
  page_to       INT,
  content       TEXT NOT NULL,
  embedding     VECTOR(1536),
  UNIQUE (document_id, chunk_index)
);
CREATE INDEX idx_dc_embedding ON document_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);


-- ============================================================
-- 4. LEDGER
-- ============================================================

CREATE TABLE treasury_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES research_companies(id) ON DELETE CASCADE,

  event_type           TEXT NOT NULL
    CHECK (event_type IN ('policy_adoption','acquisition','disposal','capital_raise',
                          'covenant_change','capital_posture_change','custody_change',
                          'listing_change','accounting_election')),
  asset_class          TEXT NOT NULL DEFAULT 'btc',   -- not bitcoin-only: sol, tokenised_treasury, property
  event_date           DATE NOT NULL,

  quantity             NUMERIC(24,8),
  consideration_native NUMERIC(20,2),
  native_currency      TEXT,
  fees_included        BOOLEAN,                       -- Locate's A$1m was fee-inclusive

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

CREATE TRIGGER treasury_events_updated_at
  BEFORE UPDATE ON treasury_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_te_company ON treasury_events(company_id, event_date DESC);
CREATE INDEX idx_te_type    ON treasury_events(event_type);


CREATE TABLE treasury_holdings_snapshots (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  UUID NOT NULL REFERENCES research_companies(id) ON DELETE CASCADE,
  as_of_date                  DATE NOT NULL,

  asset                       TEXT NOT NULL DEFAULT 'btc',
  instrument_type             TEXT NOT NULL DEFAULT 'spot'
    CHECK (instrument_type IN ('spot','fund_units','spc_investment','tokenised_fund','other')),
  quantity                    NUMERIC(24,8) NOT NULL,

  basis                       TEXT NOT NULL REFERENCES holding_bases(code),
  look_through_btc_equivalent NUMERIC(24,8),
  is_related_party_vehicle    BOOLEAN NOT NULL DEFAULT FALSE,  -- DigitalX holds units in its own ETF
  includes_customer_assets    BOOLEAN NOT NULL DEFAULT FALSE,  -- Block custodies for Cash App users

  value_native                NUMERIC(20,2),
  native_currency             TEXT,

  source_document_id          UUID NOT NULL REFERENCES research_documents(id),
  natural_key                 TEXT NOT NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, natural_key)
);
CREATE INDEX idx_ths_company ON treasury_holdings_snapshots(company_id, as_of_date DESC);


-- ============================================================
-- 5. FX
-- AUD is computed, never stored on the event. A board paper
-- quoting USD cost basis gets sent back.
-- ============================================================

CREATE TABLE fx_rates (
  rate_date      DATE NOT NULL,
  base_currency  TEXT NOT NULL,
  quote_currency TEXT NOT NULL DEFAULT 'AUD',
  rate           NUMERIC(18,8) NOT NULL,
  source         TEXT NOT NULL,
  PRIMARY KEY (rate_date, base_currency, quote_currency)
);


-- ============================================================
-- 6. JURISDICTION NOTES
-- Keyed on standard and venue, NOT on company. Written once,
-- joined onto every record. This panel is the product.
-- ============================================================

CREATE TABLE jurisdiction_notes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_key            TEXT UNIQUE NOT NULL,          -- 'aasb_138_revaluation', 'asx_lr_12_3'
  applies_to_standard TEXT,
  applies_to_venue    TEXT,
  applies_to_listing_type TEXT,
  topic               TEXT NOT NULL
    CHECK (topic IN ('accounting','tax','listing_rules','custody_licensing','disclosure')),
  title               TEXT NOT NULL,
  body                TEXT NOT NULL,                 -- markdown
  rule_reference      TEXT,                          -- cite rule text, not commentary
  primary_source_url  TEXT,
  verified_at         DATE,
  is_published        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER jurisdiction_notes_updated_at
  BEFORE UPDATE ON jurisdiction_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 7. COMPLIANCE CLASSIFICATION
-- Lex classifies per field, not per record. Promotion to
-- client-facing is a hard gate, not a review step.
-- ============================================================

CREATE TABLE research_classifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_table   TEXT NOT NULL,                 -- 'treasury_events', 'research_companies'
  subject_id      UUID NOT NULL,
  field_key       TEXT NOT NULL,

  classification  TEXT NOT NULL DEFAULT 'internal'
    CHECK (classification IN ('publishable','internal','restricted')),
  reason          TEXT NOT NULL,
  classified_by   TEXT NOT NULL DEFAULT 'lex',
  classified_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  approved_by     UUID REFERENCES team_members(id),
  approved_at     TIMESTAMPTZ,

  UNIQUE (subject_table, subject_id, field_key)
);
CREATE INDEX idx_rcl_subject ON research_classifications(subject_table, subject_id);
CREATE INDEX idx_rcl_class   ON research_classifications(classification);


-- ============================================================
-- 8. TRIGGER — SOURCE CLASS GATE
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_source_minimum()
RETURNS TRIGGER AS $$
DECLARE
  doc_rank INT;
  min_rank INT;
BEGIN
  SELECT sc.rank INTO doc_rank
    FROM research_documents d
    JOIN source_classes sc ON sc.code = d.source_class
   WHERE d.id = NEW.source_document_id;

  SELECT min_source_rank INTO min_rank
    FROM field_source_minimums WHERE field_key = TG_ARGV[0];

  IF doc_rank IS NULL OR doc_rank > min_rank THEN
    RAISE EXCEPTION
      'Source class rank % is below the minimum % required for field %',
      doc_rank, min_rank, TG_ARGV[0];
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER treasury_events_source_gate
  BEFORE INSERT OR UPDATE ON treasury_events
  FOR EACH ROW EXECUTE FUNCTION enforce_source_minimum('ledger_event');

CREATE TRIGGER holdings_source_gate
  BEFORE INSERT OR UPDATE ON treasury_holdings_snapshots
  FOR EACH ROW EXECUTE FUNCTION enforce_source_minimum('ledger_event');


-- ============================================================
-- 9. VIEWS
-- ============================================================

-- Ledger with computed AUD and full provenance
CREATE VIEW v_research_ledger AS
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
    END                                  AS consideration_aud,
    fx.rate                              AS fx_rate_used,
    fx.rate_date                         AS fx_rate_date,
    e.headline,
    e.detail,
    e.basis,
    hb.comparable                        AS basis_comparable,
    e.disclosure_venue,
    e.filing_entity,
    d.title                              AS source_title,
    d.source_class,
    sc.rank                              AS source_rank,
    d.pdf_url                            AS source_url,
    d.published_at                       AS source_published_at,
    cl.classification
  FROM treasury_events e
  JOIN research_companies c ON c.id = e.company_id
  JOIN research_documents d ON d.id = e.source_document_id
  JOIN source_classes sc ON sc.code = d.source_class
  LEFT JOIN holding_bases hb ON hb.code = e.basis
  LEFT JOIN fx_rates fx
         ON fx.rate_date = e.event_date
        AND fx.base_currency = e.native_currency
        AND fx.quote_currency = 'AUD'
  LEFT JOIN research_classifications cl
         ON cl.subject_table = 'treasury_events'
        AND cl.subject_id = e.id
        AND cl.field_key = 'ledger_event'
  ORDER BY e.event_date DESC;


-- Current position. Only comparable bases roll up.
CREATE VIEW v_company_position AS
  SELECT
    c.id                AS company_id,
    c.slug,
    c.legal_name,
    c.primary_archetype,
    s.as_of_date,
    s.asset,
    s.quantity,
    s.basis,
    hb.comparable       AS basis_comparable,
    s.look_through_btc_equivalent,
    s.is_related_party_vehicle,
    s.includes_customer_assets,
    d.title             AS source_title,
    d.pdf_url           AS source_url
  FROM research_companies c
  JOIN LATERAL (
    SELECT * FROM treasury_holdings_snapshots t
     WHERE t.company_id = c.id
     ORDER BY t.as_of_date DESC, t.created_at DESC
     LIMIT 5
  ) s ON TRUE
  JOIN holding_bases hb ON hb.code = s.basis
  JOIN research_documents d ON d.id = s.source_document_id;


-- Staleness measured against the issuer's own cadence, so the
-- quiet-day path does not report silence where silence is normal.
CREATE VIEW v_research_freshness AS
  SELECT
    c.id,
    c.slug,
    c.legal_name,
    c.tier,
    c.expected_disclosure_cadence,
    c.last_verified_at,
    MAX(d.published_at)                              AS latest_document_at,
    (CURRENT_DATE - MAX(d.published_at))             AS days_since_document,
    CASE c.expected_disclosure_cadence
      WHEN 'monthly'   THEN 45
      WHEN 'quarterly' THEN 135
      ELSE 240
    END                                              AS stale_after_days,
    (CURRENT_DATE - MAX(d.published_at)) >
      CASE c.expected_disclosure_cadence
        WHEN 'monthly'   THEN 45
        WHEN 'quarterly' THEN 135
        ELSE 240
      END                                            AS is_stale
  FROM research_companies c
  LEFT JOIN research_documents d ON d.company_id = c.id
  GROUP BY c.id;


-- The only view the client-facing surface may read.
CREATE VIEW v_research_publishable AS
  SELECT l.*
  FROM v_research_ledger l
  JOIN research_companies c ON c.id = l.company_id
  WHERE c.is_published = TRUE
    AND l.classification = 'publishable';


-- ============================================================
-- 10. RLS
-- ============================================================

ALTER TABLE research_companies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_former_names         ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_listings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_documents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasury_events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasury_holdings_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fx_rates                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE jurisdiction_notes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_classifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE holding_bases                ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_classes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_source_minimums        ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'research_companies','company_former_names','company_listings',
    'research_documents','document_chunks','treasury_events',
    'treasury_holdings_snapshots','fx_rates','jurisdiction_notes',
    'research_classifications','holding_bases','source_classes',
    'field_source_minimums'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (auth.role() = ''authenticated'')',
      t || '_all', t);
  END LOOP;
END $$;
