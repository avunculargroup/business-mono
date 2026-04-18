-- ============================================================
-- PHASE 3 — GTM OPTIMISATION
-- ============================================================
-- Adds:
--   Tables: community_watchlist, champions, champion_events
--   Columns: content_items.question_count, .validated
--
-- community_watchlist: LinkedIn groups, associations, conferences
-- champions: contacts flagged as internal advocates at accounts
-- champion_events: job changes, promotions, departures audit log
-- question_count: distinct interviews mentioning the linked pain point
-- validated: true when question_count >= 3
-- ============================================================


-- ============================================================
-- COMMUNITY WATCHLIST
-- ============================================================

CREATE TABLE IF NOT EXISTS community_watchlist (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type              TEXT        NOT NULL
                                CHECK (type IN ('linkedin_group', 'association', 'conference')),
  name              TEXT        NOT NULL,
  url               TEXT,
  description       TEXT,
  role_tags         TEXT[]      NOT NULL DEFAULT '{}',
  industry_tags     TEXT[]      NOT NULL DEFAULT '{}',
  membership_size   INTEGER,
  activity_level    INTEGER     CHECK (activity_level BETWEEN 1 AND 5),
  location          TEXT,
  start_date        DATE,
  end_date          DATE,
  timezone          TEXT,
  engagement_status TEXT        NOT NULL DEFAULT 'not_joined'
                                CHECK (engagement_status IN ('not_joined', 'joined', 'attended', 'sponsor')),
  notes             TEXT,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER community_watchlist_updated_at
  BEFORE UPDATE ON community_watchlist
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_cw_type             ON community_watchlist(type);
CREATE INDEX IF NOT EXISTS idx_cw_engagement       ON community_watchlist(engagement_status);
CREATE INDEX IF NOT EXISTS idx_cw_start_date       ON community_watchlist(start_date);
CREATE INDEX IF NOT EXISTS idx_cw_role_tags        ON community_watchlist USING gin(role_tags);
CREATE INDEX IF NOT EXISTS idx_cw_industry_tags    ON community_watchlist USING gin(industry_tags);
CREATE INDEX IF NOT EXISTS idx_cw_active           ON community_watchlist(created_at DESC) WHERE deleted_at IS NULL;


-- ============================================================
-- CHAMPIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS champions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id        UUID        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  company_id        UUID        REFERENCES companies(id) ON DELETE SET NULL,
  role_type         TEXT        NOT NULL
                                CHECK (role_type IN ('Champion', 'Economic Buyer', 'Influencer')),
  champion_score    INTEGER     NOT NULL DEFAULT 3
                                CHECK (champion_score BETWEEN 1 AND 5),
  status            TEXT        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'at_risk', 'departed')),
  last_contacted_at TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contact_id)
);

CREATE OR REPLACE TRIGGER champions_updated_at
  BEFORE UPDATE ON champions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_champions_status     ON champions(status);
CREATE INDEX IF NOT EXISTS idx_champions_company    ON champions(company_id);
CREATE INDEX IF NOT EXISTS idx_champions_score      ON champions(champion_score);


-- ============================================================
-- CHAMPION EVENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS champion_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  champion_id  UUID        NOT NULL REFERENCES champions(id) ON DELETE CASCADE,
  event_type   TEXT        NOT NULL
               CHECK (event_type IN ('job_change', 'promotion', 'departure', 'note')),
  event_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  details      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ce_champion   ON champion_events(champion_id);
CREATE INDEX IF NOT EXISTS idx_ce_event_type ON champion_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ce_event_date ON champion_events(event_date DESC);


-- ============================================================
-- CONTENT VALIDATION — augment content_items
-- ============================================================

ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS question_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS validated      BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_content_validated ON content_items(validated);


-- ============================================================
-- VALIDATION FUNCTION
-- Recomputes question_count and validated for a content_items row.
-- question_count = distinct interviews that have a pain_points row
-- whose content matches the linked pain point (case-insensitive).
-- ============================================================

CREATE OR REPLACE FUNCTION compute_pipeline_validation(pain_point_uuid UUID)
RETURNS TABLE (question_count INTEGER, validated BOOLEAN)
LANGUAGE sql STABLE AS $$
  SELECT
    COUNT(DISTINCT pp.interview_id)::INTEGER  AS question_count,
    COUNT(DISTINCT pp.interview_id) >= 3      AS validated
  FROM pain_points pp
  WHERE lower(pp.content) = lower(
    (SELECT content FROM pain_points WHERE id = pain_point_uuid)
  );
$$;


-- ============================================================
-- TRIGGER: recompute when content_items.pain_point_id changes
-- ============================================================

CREATE OR REPLACE FUNCTION content_items_revalidate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER;
  v_valid BOOLEAN;
BEGIN
  IF NEW.pain_point_id IS NULL THEN
    NEW.question_count := 0;
    NEW.validated      := false;
  ELSE
    SELECT question_count, validated
    INTO   v_count, v_valid
    FROM   compute_pipeline_validation(NEW.pain_point_id);

    NEW.question_count := COALESCE(v_count, 0);
    NEW.validated      := COALESCE(v_valid, false);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_items_validate ON content_items;
CREATE TRIGGER content_items_validate
  BEFORE INSERT OR UPDATE OF pain_point_id ON content_items
  FOR EACH ROW EXECUTE FUNCTION content_items_revalidate();


-- ============================================================
-- TRIGGER: recompute all content_items when a new pain_points
-- row is inserted (new interview may push count over threshold)
-- ============================================================

CREATE OR REPLACE FUNCTION pain_points_cascade_validate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER;
  v_valid BOOLEAN;
BEGIN
  -- Find the canonical content text for this new pain_point
  -- Then update all content_items linked to any pain_point with the same text
  SELECT question_count, validated
  INTO   v_count, v_valid
  FROM   compute_pipeline_validation(NEW.id);

  UPDATE content_items ci
  SET    question_count = COALESCE(v_count, 0),
         validated      = COALESCE(v_valid, false)
  WHERE  ci.pain_point_id IN (
    SELECT id FROM pain_points
    WHERE  lower(content) = lower(NEW.content)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pain_points_revalidate ON pain_points;
CREATE TRIGGER pain_points_revalidate
  AFTER INSERT ON pain_points
  FOR EACH ROW EXECUTE FUNCTION pain_points_cascade_validate();


-- ============================================================
-- Backfill question_count / validated for existing pipeline items
-- ============================================================

UPDATE content_items ci
SET
  question_count = (
    SELECT COUNT(DISTINCT pp2.interview_id)::INTEGER
    FROM pain_points pp1
    JOIN pain_points pp2 ON lower(pp2.content) = lower(pp1.content)
    WHERE pp1.id = ci.pain_point_id
  ),
  validated = (
    SELECT COUNT(DISTINCT pp2.interview_id) >= 3
    FROM pain_points pp1
    JOIN pain_points pp2 ON lower(pp2.content) = lower(pp1.content)
    WHERE pp1.id = ci.pain_point_id
  )
WHERE ci.pain_point_id IS NOT NULL;


-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================

ALTER TABLE community_watchlist  ENABLE ROW LEVEL SECURITY;
ALTER TABLE champions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE champion_events      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_watchlist_all" ON community_watchlist;
DROP POLICY IF EXISTS "champions_all"           ON champions;
DROP POLICY IF EXISTS "champion_events_all"     ON champion_events;

CREATE POLICY "community_watchlist_all" ON community_watchlist
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "champions_all" ON champions
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "champion_events_all" ON champion_events
  FOR ALL USING (auth.role() = 'authenticated');
