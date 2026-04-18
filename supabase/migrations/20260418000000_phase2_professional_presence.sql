-- ============================================================
-- PHASE 2 — PROFESSIONAL PRESENCE & TESTING
-- ============================================================
-- Adds:
--   Tables: pain_points, corporate_lexicon, mvp_templates,
--           mvp_template_versions, feedback
--   Columns: content_items.pain_point_id, .score, .research_links
--
-- Pain points are normalised from discovery_interviews.pain_points[]
-- into their own table so feedback and content ideas can reference
-- a specific pain point rather than an entire interview.
-- ============================================================


-- ============================================================
-- PAIN POINTS (normalised from discovery_interviews.pain_points[])
-- ============================================================

CREATE TABLE IF NOT EXISTS pain_points (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id  UUID        NOT NULL REFERENCES discovery_interviews(id) ON DELETE CASCADE,
  content       TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pp_interview ON pain_points(interview_id);

-- Backfill from existing text[] arrays
INSERT INTO pain_points (interview_id, content, created_at)
SELECT id, unnest(pain_points), NOW()
FROM   discovery_interviews
WHERE  array_length(pain_points, 1) > 0;


-- ============================================================
-- CORPORATE LEXICON
-- ============================================================

CREATE TABLE IF NOT EXISTS corporate_lexicon (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  term              TEXT        NOT NULL,
  professional_term TEXT        NOT NULL,
  definition        TEXT,
  category          TEXT,
  example_usage     TEXT,
  status            TEXT        NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft', 'approved', 'deprecated')),
  version           INTEGER     NOT NULL DEFAULT 1,
  created_by        UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  approved_by       UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER corporate_lexicon_updated_at
  BEFORE UPDATE ON corporate_lexicon
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_lexicon_status   ON corporate_lexicon(status);
CREATE INDEX IF NOT EXISTS idx_lexicon_category ON corporate_lexicon(category);
CREATE INDEX IF NOT EXISTS idx_lexicon_fts
  ON corporate_lexicon USING gin(to_tsvector('english', coalesce(term,'') || ' ' || coalesce(professional_term,'')));


-- ============================================================
-- MVP TEMPLATES
-- ============================================================

CREATE TABLE IF NOT EXISTS mvp_templates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT        NOT NULL
              CHECK (type IN ('one_pager', 'briefing_deck')),
  title       TEXT        NOT NULL,
  description TEXT,
  tags        TEXT[]      DEFAULT '{}',
  created_by  UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER mvp_templates_updated_at
  BEFORE UPDATE ON mvp_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_mvp_templates_type ON mvp_templates(type);


CREATE TABLE IF NOT EXISTS mvp_template_versions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID        NOT NULL REFERENCES mvp_templates(id) ON DELETE CASCADE,
  version_number  INTEGER     NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'approved', 'deprecated')),
  content         JSONB       NOT NULL DEFAULT '{}',
  created_by      UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  approved_by     UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_mvp_tv_template ON mvp_template_versions(template_id);
CREATE INDEX IF NOT EXISTS idx_mvp_tv_status   ON mvp_template_versions(template_id, status);


-- ============================================================
-- FEEDBACK REPOSITORY
-- ============================================================

CREATE TABLE IF NOT EXISTS feedback (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    UUID        REFERENCES contacts(id)    ON DELETE SET NULL,
  company_id    UUID        REFERENCES companies(id)   ON DELETE SET NULL,
  pain_point_id UUID        REFERENCES pain_points(id) ON DELETE SET NULL,
  source        TEXT        NOT NULL DEFAULT 'interview'
                            CHECK (source IN ('interview', 'survey', 'email', 'testimonial')),
  date_received DATE,
  category      TEXT        NOT NULL DEFAULT 'feature_request'
                            CHECK (category IN ('bug_report', 'feature_request', 'usability', 'testimonial')),
  rating        INTEGER     CHECK (rating BETWEEN 1 AND 5),
  description   TEXT        NOT NULL,
  tags          TEXT[]      DEFAULT '{}',
  sentiment     JSONB,
  created_by    UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER feedback_updated_at
  BEFORE UPDATE ON feedback
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_feedback_contact     ON feedback(contact_id);
CREATE INDEX IF NOT EXISTS idx_feedback_company     ON feedback(company_id);
CREATE INDEX IF NOT EXISTS idx_feedback_pain_point  ON feedback(pain_point_id);
CREATE INDEX IF NOT EXISTS idx_feedback_date        ON feedback(date_received DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_tags        ON feedback USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_feedback_active      ON feedback(created_at DESC) WHERE deleted_at IS NULL;


-- ============================================================
-- AUGMENT CONTENT_ITEMS (Insight Pipeline)
-- ============================================================
-- Adds pain point linkage, priority score, and research links
-- to existing content_items. The Kanban pipeline view filters
-- on type = 'linkedin'.

ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS pain_point_id   UUID        REFERENCES pain_points(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS score           INTEGER,
  ADD COLUMN IF NOT EXISTS research_links  JSONB       NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_content_pain_point ON content_items(pain_point_id);


-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================

ALTER TABLE pain_points          ENABLE ROW LEVEL SECURITY;
ALTER TABLE corporate_lexicon    ENABLE ROW LEVEL SECURITY;
ALTER TABLE mvp_templates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE mvp_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback             ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pain_points_all"           ON pain_points;
DROP POLICY IF EXISTS "corporate_lexicon_all"     ON corporate_lexicon;
DROP POLICY IF EXISTS "mvp_templates_all"         ON mvp_templates;
DROP POLICY IF EXISTS "mvp_template_versions_all" ON mvp_template_versions;
DROP POLICY IF EXISTS "feedback_all"              ON feedback;

CREATE POLICY "pain_points_all" ON pain_points
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "corporate_lexicon_all" ON corporate_lexicon
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "mvp_templates_all" ON mvp_templates
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "mvp_template_versions_all" ON mvp_template_versions
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "feedback_all" ON feedback
  FOR ALL USING (auth.role() = 'authenticated');
