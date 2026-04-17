-- ============================================================
-- DISCOVERY INTERVIEWS MIGRATION
-- ============================================================
-- Adds structured discovery interview tracking, pain point audit logging,
-- stakeholder role tagging on contacts, and segment scorecards.
--
-- New objects:
--   Types:   stakeholder_role, trigger_event_type
--   Column:  contacts.role
--   Tables:  discovery_interviews, pain_point_log, segment_scorecards
--   Trigger: pain_points_audit (on discovery_interviews)
-- ============================================================


-- ============================================================
-- ENUM TYPES
-- ============================================================

DO $$ BEGIN
  CREATE TYPE stakeholder_role AS ENUM ('CFO','CEO','HR','Treasury','PeopleOps','Other');
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  CREATE TYPE trigger_event_type AS ENUM
    ('FASB_CHANGE','EMPLOYEE_BTC_REQUEST','REGULATORY_UPDATE','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;


-- ============================================================
-- CONTACTS ENHANCEMENT
-- ============================================================

-- Nullable — existing contacts keep NULL, displayed as "Unassigned" in the portal
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS role stakeholder_role;


-- ============================================================
-- DISCOVERY INTERVIEWS
-- ============================================================

CREATE TABLE IF NOT EXISTS discovery_interviews (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      UUID        REFERENCES contacts(id)  ON DELETE CASCADE,
  company_id      UUID        REFERENCES companies(id) ON DELETE SET NULL,
  interview_date  TIMESTAMPTZ,
  status          TEXT        NOT NULL DEFAULT 'scheduled'
                              CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  channel         TEXT,
  notes           TEXT,
  pain_points     TEXT[]      DEFAULT '{}',
  trigger_event   trigger_event_type,
  email_thread_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER discovery_interviews_updated_at
  BEFORE UPDATE ON discovery_interviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_di_contact ON discovery_interviews(contact_id);
CREATE INDEX IF NOT EXISTS idx_di_company ON discovery_interviews(company_id);
CREATE INDEX IF NOT EXISTS idx_di_date    ON discovery_interviews(interview_date DESC);


-- ============================================================
-- PAIN POINT LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS pain_point_log (
  id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  interview_id  UUID        REFERENCES discovery_interviews(id) ON DELETE CASCADE,
  pain_point    TEXT        NOT NULL,
  change_type   TEXT        NOT NULL,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ppl_interview ON pain_point_log(interview_id);

-- Only fires when pain_points actually changes — guards against flooding the log
-- on unrelated field updates (notes, status, channel, etc.)
CREATE OR REPLACE FUNCTION log_pain_points() RETURNS TRIGGER AS $$
DECLARE
  pp TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.pain_points IS NOT NULL THEN
      FOREACH pp IN ARRAY NEW.pain_points LOOP
        INSERT INTO pain_point_log(interview_id, pain_point, change_type, changed_at)
        VALUES (NEW.id, pp, 'insert', NOW());
      END LOOP;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.pain_points IS DISTINCT FROM OLD.pain_points THEN
    IF NEW.pain_points IS NOT NULL THEN
      FOREACH pp IN ARRAY NEW.pain_points LOOP
        INSERT INTO pain_point_log(interview_id, pain_point, change_type, changed_at)
        VALUES (NEW.id, pp, 'update', NOW());
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER pain_points_audit
  AFTER INSERT OR UPDATE ON discovery_interviews
  FOR EACH ROW EXECUTE FUNCTION log_pain_points();


-- ============================================================
-- SEGMENT SCORECARDS
-- ============================================================

CREATE TABLE IF NOT EXISTS segment_scorecards (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_name        TEXT        UNIQUE NOT NULL,
  need_score          INTEGER     CHECK (need_score BETWEEN 1 AND 5),
  access_score        INTEGER     CHECK (access_score BETWEEN 1 AND 5),
  planned_interviews  INTEGER     NOT NULL DEFAULT 0,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER segment_scorecards_updated_at
  BEFORE UPDATE ON segment_scorecards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================

ALTER TABLE discovery_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE pain_point_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE segment_scorecards   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "discovery_interviews_all" ON discovery_interviews;
DROP POLICY IF EXISTS "pain_point_log_all"       ON pain_point_log;
DROP POLICY IF EXISTS "segment_scorecards_all"   ON segment_scorecards;

CREATE POLICY "discovery_interviews_all" ON discovery_interviews
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "pain_point_log_all" ON pain_point_log
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "segment_scorecards_all" ON segment_scorecards
  FOR ALL USING (auth.role() = 'authenticated');
