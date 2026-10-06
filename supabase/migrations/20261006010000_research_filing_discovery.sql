-- ============================================================
-- CORPORATE HOLDINGS — discovery: filings arrive by themselves
-- Spec: docs/features/corporate-holdings/schema-ingest-spec.md
--       → Discovery: how documents arrive
--
-- researchIngest reads research_documents, and every row there was entered
-- by hand. If Strategy files an 8-K tomorrow, nothing notices.
--
-- The spec's answer, built here: reportWatch already discovers documents
-- daily (the report_watch_scan routine), so a report_watch source gains a
-- company binding, and a source with one registers what it finds in
-- research_documents instead of acquiring it for the news feed.
-- researchIngest stays what it is and reads the new rows on its next run.
--
-- One venue for now: SEC EDGAR, through the `edgar` detection strategy,
-- which reads the issuer's submissions index and filters by form type and
-- 8-K item at the source. The other venues on the register (ASX, NZX, LSE,
-- TDnet, SEDAR+) have no verified machine-readable feed yet, and a guessed
-- one fills retrieval_error with fiction (see researchIngest/documents.ts).
-- ============================================================


-- ------------------------------------------------------------
-- 1. The binding
--
-- A bound source is EDGAR and nothing else, and EDGAR is only ever bound:
-- an 8-K feed with no company would land filings in the news feed, and a
-- bound RSS feed would register documents with no form type to classify
-- them by. Both directions are refused here rather than in code.
-- ------------------------------------------------------------

ALTER TABLE news_sources
  ADD COLUMN IF NOT EXISTS research_company_id UUID REFERENCES research_companies(id) ON DELETE CASCADE;

COMMENT ON COLUMN news_sources.research_company_id IS
  'Set on a report_watch source that discovers one research company''s filings. Its finds are registered in research_documents, never acquired for the news feed.';

ALTER TABLE news_sources DROP CONSTRAINT IF EXISTS news_sources_research_binding;
ALTER TABLE news_sources ADD CONSTRAINT news_sources_research_binding CHECK (
  (research_company_id IS NULL AND NOT ('edgar' = ANY (detection_strategies)))
  OR (
    research_company_id IS NOT NULL
    AND source_type = 'report_watch'
    AND detection_strategies = ARRAY['edgar']::TEXT[]
  )
);

CREATE INDEX IF NOT EXISTS idx_news_sources_research_company
  ON news_sources(research_company_id) WHERE research_company_id IS NOT NULL;


-- ------------------------------------------------------------
-- 2. Candidates remember what they became
-- ------------------------------------------------------------

ALTER TABLE report_candidates DROP CONSTRAINT IF EXISTS report_candidates_discovery_method_check;
ALTER TABLE report_candidates ADD CONSTRAINT report_candidates_discovery_method_check
  CHECK (discovery_method IN ('rss', 'sitemap', 'index_page', 'manual', 'email_attachment', 'edgar'));

-- 'registered': handed to research_documents. Terminal, like 'acquired'.
ALTER TABLE report_candidates DROP CONSTRAINT IF EXISTS report_candidates_status_check;
ALTER TABLE report_candidates ADD CONSTRAINT report_candidates_status_check
  CHECK (status IN ('new', 'queued', 'fetching', 'acquired', 'skipped', 'failed', 'duplicate', 'registered'));

ALTER TABLE report_candidates
  ADD COLUMN IF NOT EXISTS research_document_id UUID REFERENCES research_documents(id) ON DELETE SET NULL;


-- ------------------------------------------------------------
-- 3. One registration per filing
--
-- The accession number is a filing's identity at the SEC, and every SEC row
-- entered by hand carries it in announcement_id. Discovery checks before it
-- inserts; this makes a race, or a hand entry made the same day, fail loudly
-- instead of reading the same filing twice into the ledger.
-- ------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uq_research_documents_announcement
  ON research_documents(company_id, venue, announcement_id)
  WHERE announcement_id IS NOT NULL;


-- ------------------------------------------------------------
-- 4. The four SEC filers on the register
--
-- CIKs are the ones in each record's hand-registered EDGAR URLs. `since`
-- keeps the first run off the back catalogue, which was curated by hand:
-- filings from 1 September onward are registered, and any already entered
-- are recognised by accession number and left alone.
--
-- 8-K items, filtered at the source: 1.01 (a material agreement — how a
-- position is financed), 2.02 (results), 7.01 (Reg FD — weekly updates are
-- often furnished here) and 8.01 (other events — where most treasury
-- purchases are filed). Item 5.02 board changes and the rest never arrive.
-- ------------------------------------------------------------

INSERT INTO news_sources (
  name, source_type, is_active, site_url, tier,
  detection_strategies, detection_config, max_candidates_per_run, crawl_delay_seconds,
  research_company_id
)
SELECT
  'EDGAR filings — ' || c.legal_name,
  'report_watch',
  TRUE,
  'https://www.sec.gov',
  'tier_1',
  ARRAY['edgar']::TEXT[],
  jsonb_build_object('edgar', jsonb_build_object(
    'cik', s.cik,
    'forms', jsonb_build_array('8-K', '8-K/A', '10-Q', '10-Q/A', '10-K', '10-K/A', '6-K', '20-F', '40-F'),
    'items_8k', jsonb_build_array('1.01', '2.02', '7.01', '8.01'),
    'since', '2026-09-01'
  )),
  25,
  1,
  c.id
FROM (VALUES
  ('strategy',      '1050446'),
  ('sequans',       '1383395'),
  ('rum-group',     '1830081'),
  ('angel-studios', '1865200')
) AS s(slug, cik)
JOIN research_companies c ON c.slug = s.slug
WHERE NOT EXISTS (
  SELECT 1 FROM news_sources n WHERE n.research_company_id = c.id
);

-- The same CIKs as identifiers, which is where the register keeps filer ids.
INSERT INTO company_identifiers (company_id, scheme, value, note)
SELECT c.id, 'sec_cik', s.cik, 'From the record''s EDGAR filing URLs'
FROM (VALUES
  ('strategy',      '1050446'),
  ('sequans',       '1383395'),
  ('rum-group',     '1830081'),
  ('angel-studios', '1865200')
) AS s(slug, cik)
JOIN research_companies c ON c.slug = s.slug
ON CONFLICT (company_id, scheme, value) DO NOTHING;
