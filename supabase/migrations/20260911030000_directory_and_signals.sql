-- ============================================================
-- DIRECTORY, SIGNALS PROMOTION, COMMERCIAL RELATIONSHIPS
-- ============================================================
-- Depends on: 20260911020000_client_tables.sql
--
-- The spec bundle flagged the table and column names below as the
-- most likely thing in it to fail on first execution (A3). They
-- were checked against the live catalogue and they are correct:
-- ecosystem_changes carries client_relevant, compliance_class and
-- curator_note; products_services carries australian_owned,
-- category and slug; advisors_partners exists.
--
-- One name in the bundle was wrong: contracts does not exist, so
-- related_contract_id below carries no foreign key.
-- ============================================================


-- ------------------------------------------------------------
-- Financial product classification
-- ------------------------------------------------------------
-- The Corporations Amendment (Digital Assets Framework) Act 2026
-- added digital asset platforms and tokenised custody platforms to
-- s764A(1). A DAP is a facility whose operator holds digital tokens
-- on behalf of clients: exchanges, brokers, custodial wallets.
--
-- Nullable now, NOT NULL after the backfill. A default of false
-- would let an unassessed custodian slide into the directory with
-- an outbound link and a contact button, which is precisely the
-- failure this column exists to prevent — so there is no default,
-- and the client read policy below makes an unassessed row
-- invisible rather than visible-and-wrong.
-- ------------------------------------------------------------

ALTER TABLE products_services
  ADD COLUMN is_financial_product BOOLEAN,
  ADD COLUMN product_classification_note TEXT,
  ADD COLUMN classified_by UUID REFERENCES team_members(id),
  ADD COLUMN classified_at TIMESTAMPTZ;

-- Backfill deliberately omitted. Every existing row must be
-- assessed by a human before the directory ships — 24 rows as at
-- 2026-09-11. Then, in its own migration:
--
--   ALTER TABLE products_services
--     ALTER COLUMN is_financial_product SET NOT NULL;
--
-- Leaving it nullable in the meantime is honest; a default would
-- be a lie.

ALTER TABLE products_services ADD CONSTRAINT classification_has_reasoning
  CHECK (
    is_financial_product IS NULL
    OR (product_classification_note IS NOT NULL AND classified_by IS NOT NULL)
  );

COMMENT ON COLUMN products_services.is_financial_product IS
  'DAP or TCP under s764A(1) as amended April 2026. Drives whether the directory card carries any call to action. NULL means unassessed, and unassessed rows are invisible to subscribers.';


-- ------------------------------------------------------------
-- Client-safe curator notes
-- ------------------------------------------------------------
-- A separate column, not a filtered view of curator_note.
--
-- The internal note is written for a director and is allowed to
-- editorialise, because directors are allowed to have views.
-- "Only affects the Mk3, most clients are on the Q" promotes fine.
-- "We would move off this custodian" does not, and it only has to
-- escape once. Promotion is an act of authorship, not a filter.
-- ------------------------------------------------------------

ALTER TABLE ecosystem_changes
  ADD COLUMN client_note TEXT,
  ADD COLUMN client_promoted_by UUID REFERENCES team_members(id),
  ADD COLUMN client_promoted_at TIMESTAMPTZ;

-- Promotion requires a human, always. Even for neutral changes.
--
-- client_relevant is NOT NULL on this table, so IS NOT TRUE reads
-- as a plain negation here rather than as three-valued caution.
-- It is written this way so the constraint survives the column
-- being made nullable later.
ALTER TABLE ecosystem_changes ADD CONSTRAINT promotion_needs_approver
  CHECK (
    client_relevant IS NOT TRUE
    OR (client_promoted_by IS NOT NULL AND client_promoted_at IS NOT NULL)
  );

COMMENT ON COLUMN ecosystem_changes.client_note IS
  'Client-safe note. Authored separately from curator_note. Never derived from it programmatically.';


-- ------------------------------------------------------------
-- commercial_relationships
-- ------------------------------------------------------------
-- Records every commercial or reciprocal arrangement between BTS
-- and a listed entity, INCLUDING the ones worth nothing. A
-- reciprocal referral with no money in it is still a conflict and
-- still gets disclosed.
-- ------------------------------------------------------------

CREATE TABLE commercial_relationships (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  entity_type         TEXT NOT NULL
                      CHECK (entity_type IN ('product_service', 'advisor_partner')),
  entity_id           UUID NOT NULL,

  relationship_type   TEXT NOT NULL
                      CHECK (relationship_type IN
                        ('inbound_referral', 'reciprocal', 'commercial_agreement', 'none')),

  direction           TEXT NOT NULL
                      CHECK (direction IN ('inbound', 'outbound', 'mutual', 'none')),

  fee_basis           TEXT NOT NULL DEFAULT 'none'
                      CHECK (fee_basis IN ('none', 'flat', 'per_referral')),
  fee_amount          NUMERIC(10,2),

  -- Rendered verbatim on the directory card. Authored, not templated.
  disclosure_text     TEXT NOT NULL,

  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  started_at          DATE,
  ended_at            DATE,

  -- No REFERENCES clause: the contracts table the spec bundle
  -- names does not exist, in schema.sql or in the live database.
  -- The column is kept because the paperwork behind an
  -- arrangement is worth pointing at, and gains its FK the day
  -- that table is built.
  related_contract_id UUID,

  approved_by         UUID REFERENCES team_members(id),
  notes               TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER commercial_relationships_updated_at
  BEFORE UPDATE ON commercial_relationships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_commercial_relationships_entity
  ON commercial_relationships(entity_type, entity_id);

COMMENT ON COLUMN commercial_relationships.related_contract_id IS
  'Intended FK to contracts, which does not exist yet. Unenforced until it does.';


-- ------------------------------------------------------------
-- The decision, enforced
-- ------------------------------------------------------------
-- No referral revenue, in either direction, in this MVP. The
-- subscription is the business model.
--
-- Why a constraint rather than a policy: because "we decided not
-- to do referrals" is a sentence someone forgets in eighteen
-- months, and a CHECK constraint is not.
--
-- Relevant if it is ever reopened, product reason first:
--   - Independence is the inventory. A register of provider status
--     is worth a subscription precisely because the providers being
--     tracked are not paying for it, and taking their money would
--     make the asset worth less than the money.
--   - DAPs and TCPs became financial products in April 2026.
--     Bitcoin itself is not one and was unaffected.
--   - ASIC INFO 269: a paid service commenting on financial
--     products is more likely to be giving advice about them. BTS
--     does not give financial advice and holds no AFS
--     authorisation, so this is the sentence here that matters
--     most.
--
-- Reopening it starts with legal advice on whether taking payment
-- from providers you report on changes what the service is. Not
-- with a migration.
-- ------------------------------------------------------------

ALTER TABLE commercial_relationships ADD CONSTRAINT no_fees_mvp
  CHECK (fee_basis = 'none' AND fee_amount IS NULL);


-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

ALTER TABLE commercial_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commercial_relationships_team" ON commercial_relationships
  FOR ALL USING (is_team_member());

-- Subscribers read active disclosures. This is what makes
-- /directory/how-we-make-money generated rather than maintained.
CREATE POLICY "commercial_relationships_client_read" ON commercial_relationships
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND is_active = TRUE
  );


-- ------------------------------------------------------------
-- The register's client clearance flag
-- ------------------------------------------------------------
-- On research_companies, not research_classifications. The spec
-- bundle implies Lex's verdict is per company; the table that
-- holds Lex's verdicts is keyed subject_table/subject_id/field_key
-- and classifies a *field*. Clearing a register entry for
-- distribution is a decision about the whole entry, so it belongs
-- next to the entry.
--
-- Distinct from is_published, which is already on this table.
-- Published means the internal register shows it; client_cleared
-- means a paying subscriber may. Those are different questions
-- with different answers, and collapsing them would make the
-- second one unaskable. Both are required by the
-- read policy above.
--
-- No default of true. A register entry reaches a subscriber
-- because someone said so.
-- ------------------------------------------------------------

ALTER TABLE research_companies
  ADD COLUMN client_cleared BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN client_cleared_by UUID REFERENCES team_members(id),
  ADD COLUMN client_cleared_at TIMESTAMPTZ;

ALTER TABLE research_companies ADD CONSTRAINT client_clearance_needs_approver
  CHECK (
    client_cleared IS NOT TRUE
    OR (client_cleared_by IS NOT NULL AND client_cleared_at IS NOT NULL)
  );

COMMENT ON COLUMN research_companies.client_cleared IS
  'Cleared for distribution to a paying subscriber. Distinct from is_published, which gates the internal register: same row, different question.';


-- ------------------------------------------------------------
-- Client read policies for the spine tables
-- ------------------------------------------------------------
-- Two conditions on every one of them:
--
--   1. The caller is a subscriber at all
--   2. The row cleared its gate — promoted, published, assessed
--
-- The second is why apps/client cannot leak an unreviewed row
-- even if a component forgets to filter. The filter is a WHERE
-- clause in the database, not a prop in React.
--
-- Column names differ per table and were read from the live
-- catalogue rather than assumed.
-- ------------------------------------------------------------

CREATE POLICY "ecosystem_changes_client_read" ON ecosystem_changes
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND client_relevant = TRUE
    AND client_promoted_by IS NOT NULL
  );

CREATE POLICY "products_services_client_read" ON products_services
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND is_financial_product IS NOT NULL   -- unassessed rows stay invisible
  );

CREATE POLICY "advisors_partners_client_read" ON advisors_partners
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND active = TRUE
  );

-- The Brief. market_reports carries both halves: narration_markdown
-- is the narration, findings is the JSONB array of finding rows
-- beneath it. Published only — the publish wall is the gate here,
-- same as everywhere else.
--
-- report_segments is deliberately NOT granted. It belongs to
-- `reports` (the research report chunking for RAG), not to
-- market_reports, and a policy joining the two would have matched
-- nothing while looking like it worked.
--
-- report_mode ('normal' | 'quiet') is what the quiet-day path
-- reads. It is a column on this table, so a quiet day is a
-- published report that says nothing happened — distinct from no
-- report at all, which is what the repository contract's null
-- return means.
CREATE POLICY "market_reports_client_read" ON market_reports
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND status = 'published'
  );

-- Indicators. Reference data, and the definitions are not
-- sensitive — but a subscriber still only reads them as a
-- subscriber, so the first condition holds here too.
CREATE POLICY "economic_indicators_client_read" ON economic_indicators
  FOR SELECT USING (current_client_account_id() IS NOT NULL);

CREATE POLICY "indicator_observations_client_read" ON indicator_observations
  FOR SELECT USING (current_client_account_id() IS NOT NULL);

CREATE POLICY "onchain_indicators_client_read" ON onchain_indicators
  FOR SELECT USING (current_client_account_id() IS NOT NULL);

CREATE POLICY "onchain_observations_client_read" ON onchain_observations
  FOR SELECT USING (current_client_account_id() IS NOT NULL);

-- The register. Cleared entries only: research_classifications
-- carries Lex's verdict, and a company with no cleared
-- classification is not visible at all.
CREATE POLICY "research_companies_client_read" ON research_companies
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND is_published = TRUE
    AND client_cleared = TRUE
  );

-- ------------------------------------------------------------
-- Implementation facts, not outcome facts
-- ------------------------------------------------------------
-- /register exists for learning and for building your own treasury
-- case. It answers "how did an Australian entity actually do this"
-- — which accounting standard, which custody model, what board
-- authority, how it was disclosed and when. It never answers "how
-- did it go for them".
--
-- The moment outcome facts appear, the page stops being precedent
-- and starts being performance, which is a different question about
-- a different asset — and a paying subscriber reading performance
-- figures about named listed securities is the one shape this
-- product must not take.
--
-- So the split is a column on the field-key lookup rather than a
-- list in a WHERE clause or, worse, in a component. A new field key
-- coined by the research pipeline has no row here and is therefore
-- invisible to subscribers until someone classifies it. Silent
-- exclusion is the safe direction: a missing implementation fact is
-- a gap, a leaked outcome fact is the product changing shape.
-- ------------------------------------------------------------

ALTER TABLE field_source_minimums
  ADD COLUMN client_fact_class TEXT
    CHECK (client_fact_class IN ('implementation', 'outcome'));

COMMENT ON COLUMN field_source_minimums.client_fact_class IS
  'Whether a field key is an implementation fact (how it was done — reaches /register) or an outcome fact (how it went — never does). NULL means unclassified, and unclassified is invisible to subscribers.';

-- Classified against the seven keys in the live catalogue as at
-- 2026-09-11. Each one is a judgement and each is recorded here
-- rather than in code, so changing one is a reviewable migration.
UPDATE field_source_minimums SET client_fact_class = 'implementation'
 WHERE field_key IN (
   'accounting_treatment',  -- which standard, and how measured
   'custody',               -- who holds the keys, under what arrangement
   'mandate',               -- the board or deed authority relied on
   'covenants',             -- how the position was financed, and on what terms
   'identity',              -- ABN, registered office, listing venue
   'ledger_event'           -- what was done and when it was disclosed
 );

-- "Funding runway" and "operating context" describe how an entity is
-- faring, not how it implemented anything. That is performance.
UPDATE field_source_minimums SET client_fact_class = 'outcome'
 WHERE field_key = 'operating_metric';

CREATE POLICY "field_source_minimums_client_read" ON field_source_minimums
  FOR SELECT USING (current_client_account_id() IS NOT NULL);

CREATE POLICY "research_company_facts_client_read" ON research_company_facts
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM research_companies rc
      WHERE rc.id = research_company_facts.company_id
        AND rc.is_published = TRUE
        AND rc.client_cleared = TRUE
    )
    -- Implementation facts only. An unclassified key has no row and
    -- fails this test, which is the intended direction.
    AND EXISTS (
      SELECT 1 FROM field_source_minimums f
      WHERE f.field_key = research_company_facts.field_key
        AND f.client_fact_class = 'implementation'
    )
  );

CREATE POLICY "treasury_events_client_read" ON treasury_events
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM research_companies rc
      WHERE rc.id = treasury_events.company_id
        AND rc.is_published = TRUE
        AND rc.client_cleared = TRUE
    )
  );

CREATE POLICY "company_listings_client_read" ON company_listings
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM research_companies rc
      WHERE rc.id = company_listings.company_id
        AND rc.is_published = TRUE
        AND rc.client_cleared = TRUE
    )
  );

-- Lookups the register's rendering needs. Neither carries a
-- company reference, and both are reference data the register is
-- unreadable without.
CREATE POLICY "holding_bases_client_read" ON holding_bases
  FOR SELECT USING (current_client_account_id() IS NOT NULL);

CREATE POLICY "source_classes_client_read" ON source_classes
  FOR SELECT USING (current_client_account_id() IS NOT NULL);


-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
-- As a subscriber session:
--   SELECT count(*) FROM ecosystem_changes;
-- should equal the count of promoted rows, not the table count.
--
--   INSERT INTO commercial_relationships
--     (entity_type, entity_id, relationship_type, direction,
--      disclosure_text, fee_basis, fee_amount)
--   VALUES ('product_service', gen_random_uuid(), 'reciprocal',
--           'mutual', 'x', 'flat', 500);
-- should fail with no_fees_mvp. If it succeeds, the constraint did
-- not apply and the decision is not enforced.
--
--   UPDATE research_companies SET client_cleared = TRUE
--   WHERE id = '<any>';
-- should fail with client_clearance_needs_approver.
--
-- As a subscriber, an outcome fact must not come back even for a
-- cleared company — expect zero rows:
--   SELECT count(*) FROM research_company_facts
--    WHERE field_key = 'operating_metric';
-- ------------------------------------------------------------
