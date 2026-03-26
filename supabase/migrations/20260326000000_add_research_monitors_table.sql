-- research_monitors: scheduled research monitoring topics for the Researcher agent

CREATE TABLE IF NOT EXISTS research_monitors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject         TEXT NOT NULL,
  context         TEXT,
  search_queries  TEXT[] NOT NULL,
  frequency       TEXT NOT NULL DEFAULT 'weekly'
                  CHECK (frequency IN ('daily', 'weekly', 'fortnightly')),
  next_run_at     TIMESTAMPTZ NOT NULL,
  last_run_at     TIMESTAMPTZ,
  last_digest     TEXT,
  notify_signal   BOOLEAN NOT NULL DEFAULT TRUE,
  notify_agent    TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID REFERENCES team_members(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER research_monitors_updated_at
  BEFORE UPDATE ON research_monitors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_research_monitors_next_run ON research_monitors(next_run_at)
  WHERE is_active = TRUE;

ALTER TABLE research_monitors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "research_monitors_all" ON research_monitors;
CREATE POLICY "research_monitors_all" ON research_monitors
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));
