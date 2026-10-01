-- ============================================================
-- CORPORATE HOLDINGS — identity, jurisdiction and calendars
-- Spec: docs/features/corporate-holdings/schema-ingest-spec.md
--       → Identity, jurisdiction and calendars (sequencing step 2)
--
-- Rule 3 of the feature is that a ticker is never a key, and the schema had
-- nowhere to put the identifiers that do not change except five
-- Australian-shaped columns. Records 4–12 needed an Isle of Man company
-- number, SEC CIKs, and two CIKs for one company.
--
-- Expand only. acn/abn/arbn/isin/lei are copied into company_identifiers and
-- left in place: the deployed apps still read them, and migrations apply on
-- merge before the apps redeploy. A later migration drops them once nothing
-- reads them.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Identifiers
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS company_identifiers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES research_companies(id) ON DELETE CASCADE,
  scheme      TEXT NOT NULL,   -- 'sec_cik', 'acn', 'abn', 'arbn', 'iom_company_number', 'lei', 'isin', 'sedar_profile'
  value       TEXT NOT NULL,
  valid_from  DATE,
  valid_to    DATE,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, scheme, value)
);

-- Entity resolution runs on (scheme, value), so it needs an index that does
-- not start at company_id.
CREATE INDEX IF NOT EXISTS idx_ci_scheme_value ON company_identifiers(scheme, value);

COMMENT ON TABLE company_identifiers IS
  'Registration numbers and filer ids. Open vocabulary in scheme, because the next record '
  'will bring a registry nobody has seen yet. A company may hold several values in one scheme '
  'over time (two CIKs), hence valid_from/valid_to rather than a column per scheme.';

ALTER TABLE company_identifiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_identifiers_team" ON company_identifiers;
CREATE POLICY "company_identifiers_team" ON company_identifiers
  FOR ALL USING (is_team_member());

INSERT INTO company_identifiers (company_id, scheme, value)
SELECT id, scheme, value
  FROM research_companies
 CROSS JOIN LATERAL (VALUES ('acn', acn), ('abn', abn), ('arbn', arbn), ('isin', isin), ('lei', lei))
       AS v(scheme, value)
 WHERE value IS NOT NULL
ON CONFLICT (company_id, scheme, value) DO NOTHING;

COMMENT ON COLUMN research_companies.acn  IS 'Deprecated: read company_identifiers. Dropped once no reader remains.';
COMMENT ON COLUMN research_companies.abn  IS 'Deprecated: read company_identifiers. Dropped once no reader remains.';
COMMENT ON COLUMN research_companies.arbn IS 'Deprecated: read company_identifiers. Dropped once no reader remains.';
COMMENT ON COLUMN research_companies.isin IS 'Deprecated: read company_identifiers. Dropped once no reader remains.';
COMMENT ON COLUMN research_companies.lei  IS 'Deprecated: read company_identifiers. Dropped once no reader remains.';


-- ------------------------------------------------------------
-- 2. Jurisdiction
--
-- NOT NULL forced the string 'unknown' into a country-code column for Hamak
-- (depositary-interest listing) and RUM Group (secondary sources conflict).
-- A sentinel in a country column will eventually be read as a country.
-- ------------------------------------------------------------

ALTER TABLE research_companies ALTER COLUMN jurisdiction DROP NOT NULL;

ALTER TABLE research_companies
  ADD COLUMN IF NOT EXISTS jurisdiction_basis TEXT
    CHECK (jurisdiction_basis IN ('stated_in_filing', 'inferred_from_listing', 'unknown'));

UPDATE research_companies
   SET jurisdiction = NULL, jurisdiction_basis = 'unknown'
 WHERE jurisdiction = 'unknown';

-- An absent jurisdiction says why it is absent. IS NOT DISTINCT FROM, not =:
-- with both columns NULL, `= 'unknown'` is NULL and a NULL check passes.
ALTER TABLE research_companies DROP CONSTRAINT IF EXISTS research_companies_jurisdiction_explained;
ALTER TABLE research_companies ADD CONSTRAINT research_companies_jurisdiction_explained
  CHECK (jurisdiction IS NOT NULL OR jurisdiction_basis IS NOT DISTINCT FROM 'unknown');


-- ------------------------------------------------------------
-- 3. Security class on listings
--
-- Strategy has five primary Nasdaq lines — one common, four perpetual
-- preferred — and Hamak and Panther list depositary interests. listing_type
-- keeps its job (primary, secondary, foreign exempt); this says what the line
-- is. Left NULL on existing rows: which class each one is, is research.
-- ------------------------------------------------------------

ALTER TABLE company_listings
  ADD COLUMN IF NOT EXISTS security_class TEXT
    CHECK (security_class IN ('common', 'preferred', 'depositary_interest', 'cdi', 'other'));


-- ------------------------------------------------------------
-- 4. Fiscal calendars
--
-- Goodfood reports on a 52/53-week calendar, so financial_year_end held a
-- sentence. financial_year_end is for the date case only; the sentence is
-- already in Goodfood's curator_notes.
-- ------------------------------------------------------------

ALTER TABLE research_companies
  ADD COLUMN IF NOT EXISTS fiscal_calendar_type TEXT
    CHECK (fiscal_calendar_type IN ('calendar_date', 'week_based_52_53'));

UPDATE research_companies
   SET fiscal_calendar_type = 'week_based_52_53', financial_year_end = NULL
 WHERE financial_year_end ILIKE 'week-based%';

UPDATE research_companies
   SET fiscal_calendar_type = 'calendar_date'
 WHERE fiscal_calendar_type IS NULL AND financial_year_end ~ '^\d{2}-\d{2}$';


-- ------------------------------------------------------------
-- 5. Japanese GAAP
--
-- Metaplanet read 'other', the one record where reporting_standard said
-- nothing useful.
-- ------------------------------------------------------------

ALTER TABLE research_companies DROP CONSTRAINT IF EXISTS research_companies_reporting_standard_check;
ALTER TABLE research_companies ADD CONSTRAINT research_companies_reporting_standard_check
  CHECK (reporting_standard IN ('aasb', 'nz_ifrs', 'us_gaap', 'sfrs', 'ifrs', 'jgaap', 'other'));

UPDATE research_companies SET reporting_standard = 'jgaap'
 WHERE slug = 'metaplanet' AND reporting_standard = 'other';
