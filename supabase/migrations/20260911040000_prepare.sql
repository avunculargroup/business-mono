-- ============================================================
-- PREPARE
-- Board papers, trustee minutes, auditor evidence packs
-- ============================================================
-- Depends on: 20260911020000_client_tables.sql
--
-- Note what is not here: any table holding a subscriber's prose.
-- Composed documents live in IndexedDB on the subscriber's device
-- and are never transmitted. The server holds templates and an
-- audit trail of which facts it served.
--
-- The general advice boundary stops being a policy anyone has to
-- remember and becomes a fact about where bytes live.
-- ============================================================


-- ------------------------------------------------------------
-- prepare_templates
-- ------------------------------------------------------------

CREATE TABLE prepare_templates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  slug                  TEXT NOT NULL,      -- stable across versions
  title                 TEXT NOT NULL,

  artefact_type         TEXT NOT NULL
                        CHECK (artefact_type IN (
                          'board_paper',
                          'audit_committee_note',
                          'treasury_policy',
                          'trustee_minute',
                          'investment_strategy_addendum',
                          'auditor_evidence',
                          'valuation_pack')),

  client_type           TEXT NOT NULL
                        CHECK (client_type IN ('corporate', 'smsf', 'both')),

  version               TEXT NOT NULL,

  status                TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'under_review', 'lex_review',
                                          'approved', 'active', 'superseded', 'archived')),

  body                  TEXT NOT NULL,      -- YAML front matter + ::section blocks
  facts_required        TEXT[] NOT NULL DEFAULT '{}',

  lex_reviewed_at       TIMESTAMPTZ,
  lex_reviewed_by       UUID REFERENCES team_members(id),
  lex_notes             TEXT,

  regulatory_references TEXT[],             -- e.g. {'SIS Reg 4.09','AASB 138'}
  review_due_date       DATE,

  notes                 TEXT,
  created_by            UUID REFERENCES team_members(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER prepare_templates_updated_at
  BEFORE UPDATE ON prepare_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE UNIQUE INDEX idx_prepare_templates_slug_version
  ON prepare_templates(slug, version);

-- One active version per slug, enforced in the DB rather than the
-- API. Two active board paper templates would silently split the
-- subscriber base and nobody would notice for months.
CREATE UNIQUE INDEX idx_prepare_templates_one_active
  ON prepare_templates(slug)
  WHERE status = 'active';

CREATE INDEX idx_prepare_templates_type ON prepare_templates(artefact_type, client_type);

-- Nothing reaches a subscriber without Lex having looked at it.
ALTER TABLE prepare_templates ADD CONSTRAINT active_requires_lex_review
  CHECK (
    status <> 'active'
    OR (lex_reviewed_at IS NOT NULL AND lex_reviewed_by IS NOT NULL)
  );

COMMENT ON TABLE prepare_templates IS
  'Deterministic document templates. No LLM composes at generation time: template review is O(templates), agent generation is O(documents).';


-- ------------------------------------------------------------
-- prepare_generations
-- ------------------------------------------------------------
-- Records THAT a pack was generated and WHAT FACTS BTS SERVED.
-- Records nothing the subscriber wrote.
--
-- The reason it exists: if a template is later found to be wrong,
-- this answers "who received the bad version, and which facts were
-- current when they did". That is the only reason it exists, and it
-- is why there is no text column anywhere below.
-- ------------------------------------------------------------

CREATE TABLE prepare_generations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  template_id      UUID NOT NULL REFERENCES prepare_templates(id),
  template_version TEXT NOT NULL,
  artefact_type    TEXT NOT NULL,

  -- The Fact[] array served, verbatim. BTS's own market data, not
  -- the client's circumstances.
  fact_snapshot    JSONB NOT NULL DEFAULT '[]',

  event            TEXT NOT NULL DEFAULT 'created'
                   CHECK (event IN ('created', 'facts_refreshed', 'exported')),

  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prepare_generations_account ON prepare_generations(account_id);
CREATE INDEX idx_prepare_generations_template ON prepare_generations(template_id);
CREATE INDEX idx_prepare_generations_at ON prepare_generations(generated_at DESC);


-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

ALTER TABLE prepare_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE prepare_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prepare_templates_team" ON prepare_templates
  FOR ALL USING (is_team_member());

-- Subscribers see active templates matching their client_type.
CREATE POLICY "prepare_templates_client_read" ON prepare_templates
  FOR SELECT USING (
    status = 'active'
    AND client_type IN (
      'both',
      (SELECT a.client_type
         FROM client_accounts a
        WHERE a.id = current_client_account_id())
    )
  );

CREATE POLICY "prepare_generations_team" ON prepare_generations
  FOR ALL USING (is_team_member());

CREATE POLICY "prepare_generations_own_read" ON prepare_generations
  FOR SELECT USING (account_id = current_client_account_id());

-- The second and last write a subscriber can perform. Insert only,
-- own account, no text column to abuse.
CREATE POLICY "prepare_generations_own_insert" ON prepare_generations
  FOR INSERT WITH CHECK (account_id = current_client_account_id());


-- ------------------------------------------------------------
-- Template review
-- ------------------------------------------------------------
-- The spec says review_due_date "feeds compliance_obligations".
-- There is no compliance_obligations table — it is one of the four
-- the bundle assumed and none of which existed. This view is what
-- exists instead: the same information, queryable, with nothing
-- consuming it on a schedule yet.
--
-- Intervals differ by artefact. The SIS-derived templates move
-- rarely; anything referencing the DAP transition arrangements
-- will move repeatedly over the next eighteen months. Set per
-- template, not globally.
-- ------------------------------------------------------------

CREATE VIEW v_prepare_template_reviews AS
  SELECT
    t.id,
    t.slug,
    t.title,
    t.artefact_type,
    t.client_type,
    t.version,
    t.status,
    t.lex_reviewed_at,
    t.review_due_date,
    (t.review_due_date - CURRENT_DATE) AS days_until_review,
    t.regulatory_references,
    tm.full_name AS lex_reviewed_by_name,
    COUNT(g.id) FILTER (WHERE g.event = 'created') AS packs_generated
  FROM prepare_templates t
  LEFT JOIN team_members tm ON tm.id = t.lex_reviewed_by
  LEFT JOIN prepare_generations g ON g.template_id = t.id
  WHERE t.status = 'active'
  GROUP BY t.id, tm.full_name
  ORDER BY t.review_due_date ASC NULLS LAST;

-- packs_generated is the blast radius. If a template turns out to be
-- wrong, this is how many documents went out under it.


-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
-- Should fail with active_requires_lex_review:
--   INSERT INTO prepare_templates (slug, title, artefact_type, client_type,
--     version, status, body)
--   VALUES ('test','Test','board_paper','corporate','1.0','active','');
--
-- Should fail with idx_prepare_templates_one_active on the second:
--   two rows, same slug, both status = 'active'.
--
-- As a corporate subscriber, this should return zero:
--   SELECT count(*) FROM prepare_templates WHERE client_type = 'smsf';
-- ------------------------------------------------------------
