-- routines: generic scheduled agent jobs. Supersedes research_monitors.
-- A routine binds an agent to a recurring action (daily/weekly/fortnightly)
-- with an optional dashboard tile surface and an optional source-archival flow.

CREATE TABLE IF NOT EXISTS routines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  description       TEXT,
  agent_name        TEXT NOT NULL
                    CHECK (agent_name IN
                      ('simon','roger','archie','petra','bruno','charlie','rex','della')),
  action_type       TEXT NOT NULL
                    CHECK (action_type IN ('research_digest','monitor_change')),
  action_config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  frequency         TEXT NOT NULL
                    CHECK (frequency IN ('daily','weekly','fortnightly')),
  time_of_day       TIME NOT NULL DEFAULT '07:00',
  timezone          TEXT NOT NULL DEFAULT 'Australia/Melbourne',
  next_run_at       TIMESTAMPTZ NOT NULL,
  last_run_at       TIMESTAMPTZ,
  last_result       JSONB,
  last_status       TEXT CHECK (last_status IN ('success','failed','running')),
  last_error        TEXT,
  show_on_dashboard BOOLEAN NOT NULL DEFAULT FALSE,
  dashboard_title   TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        UUID REFERENCES team_members(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER routines_updated_at
  BEFORE UPDATE ON routines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_routines_next_run
  ON routines(next_run_at) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_routines_dashboard
  ON routines(show_on_dashboard) WHERE show_on_dashboard;

ALTER TABLE routines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "routines_all" ON routines;
CREATE POLICY "routines_all" ON routines
  FOR ALL USING (auth.role() IN ('authenticated','service_role'));

-- ─────────────────────────────────────────────────────────────────────────────
-- Migrate existing research_monitors rows into routines.
-- Each legacy monitor becomes a Rex 'monitor_change' routine preserving
-- frequency, schedule state, digest and notification routing.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'research_monitors') THEN
    INSERT INTO routines (
      name, description, agent_name, action_type, action_config,
      frequency, time_of_day, timezone,
      next_run_at, last_run_at, last_result,
      is_active, created_by, created_at
    )
    SELECT
      subject,
      context,
      'rex',
      'monitor_change',
      jsonb_build_object(
        'subject',        subject,
        'context',        context,
        'search_queries', search_queries,
        'notify_signal',  notify_signal,
        'notify_agent',   notify_agent,
        'last_digest',    last_digest
      ),
      frequency,
      '07:00'::TIME,
      'Australia/Melbourne',
      next_run_at,
      last_run_at,
      CASE WHEN last_digest IS NULL THEN NULL
           ELSE jsonb_build_object('digest', last_digest, 'sources', '[]'::jsonb)
      END,
      is_active,
      created_by,
      created_at
    FROM research_monitors;

    DROP TABLE research_monitors CASCADE;
  END IF;
END $$;
