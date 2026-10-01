-- ============================================================
-- CORPORATE HOLDINGS — why a record is empty, and what the trackers say
-- Spec: docs/features/corporate-holdings/schema-ingest-spec.md
--       → Why a record is empty, and what the internet thinks (sequencing step 4)
-- ============================================================


-- ------------------------------------------------------------
-- 1. Why a ledger is absent
--
-- Seven records have no holdings ledger for four unrelated reasons, and a
-- page cannot tell them apart. It is also a work queue: primary_not_located
-- is research, filing_system_unreachable is engineering.
-- ------------------------------------------------------------

ALTER TABLE research_companies
  ADD COLUMN IF NOT EXISTS ledger_absence_reason TEXT
    CHECK (ledger_absence_reason IN
      ('no_stated_basis', 'source_class_refused', 'primary_not_located',
       'filing_system_unreachable', 'no_holding'));

-- As the spec's table records them at 1 October. source_class_refused will
-- clear for Angel Studios and RUM Group once their refused claims are
-- re-entered under the per-field sets.
UPDATE research_companies SET ledger_absence_reason = v.reason
  FROM (VALUES
    ('digitalx',        'no_stated_basis'),
    ('block-inc',       'no_stated_basis'),
    ('angel-studios',   'source_class_refused'),
    ('rum-group',       'source_class_refused'),
    ('333d',            'primary_not_located'),
    ('panther-metals',  'primary_not_located'),
    ('goodfood-market', 'filing_system_unreachable')
  ) AS v(slug, reason)
 WHERE research_companies.slug = v.slug
   AND research_companies.ledger_absence_reason IS NULL;


-- ------------------------------------------------------------
-- 2. Document resolution
--
-- documents.ts computes resolved/unresolved at run time, and the table only
-- had retrieval_error, which reads as a fetch failure. A document with no URL
-- was never attempted; the register should be able to say so.
--
-- Backfilled from what is stored. Metaplanet's over-long URL is 'resolved':
-- the 250-character limit it hit belonged to the research tool, not to the
-- ingest's fetcher.
-- ------------------------------------------------------------

ALTER TABLE research_documents
  ADD COLUMN IF NOT EXISTS resolution_status TEXT
    CHECK (resolution_status IN ('resolved', 'no_url', 'unfetchable', 'fetch_failed'));

UPDATE research_documents SET resolution_status = CASE
    WHEN retrieval_error IS NOT NULL THEN 'fetch_failed'
    WHEN pdf_url IS NULL             THEN 'no_url'
    ELSE 'resolved'
  END
 WHERE resolution_status IS NULL;


-- ------------------------------------------------------------
-- 3. Tracker claims
--
-- RUM Group's trackers were nine months stale and 28% low; Sequans' exit was
-- reported as both 314 and 34 BTC by one aggregator. Populated
-- opportunistically during research, never scraped on a schedule (decided
-- 29 September). Secondary claims are evidence of divergence, never a source:
-- nothing here feeds a snapshot.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS secondary_claims (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES research_companies(id) ON DELETE CASCADE,
  source_name      TEXT NOT NULL,          -- 'bitcointreasuries.net', 'theblock.co'
  source_url       TEXT,
  claimed_quantity NUMERIC(24,8),
  claimed_as_of    DATE,                   -- the date the tracker stamps on its figure
  observed_at      DATE NOT NULL,          -- when we saw it
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, source_name, observed_at)
);

ALTER TABLE secondary_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "secondary_claims_team" ON secondary_claims;
CREATE POLICY "secondary_claims_team" ON secondary_claims
  FOR ALL USING (is_team_member());

ALTER TABLE research_findings DROP CONSTRAINT IF EXISTS research_findings_finding_type_check;
ALTER TABLE research_findings ADD CONSTRAINT research_findings_finding_type_check
  CHECK (finding_type IN ('holdings_change', 'policy_change', 'covenant_change',
                          'capital_posture_change', 'custody_change', 'listing_change',
                          'accounting_election', 'structural_absence', 'tracker_divergence'));
