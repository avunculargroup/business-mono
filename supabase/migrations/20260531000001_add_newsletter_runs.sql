-- newsletter_runs: one row per newsletter workflow execution. Tracks the run's
-- lifecycle (incl. the two human suspend gates), ties it to the Mastra
-- workflow_run_id for resume, and records the editorial scorecard + final
-- content_item for reporting on the /content page. The Signal listener uses
-- requested_by_signal to match an inbound gate reply to the suspended run.

CREATE TABLE IF NOT EXISTS newsletter_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id     TEXT UNIQUE NOT NULL,
  trigger_source      TEXT NOT NULL CHECK (trigger_source IN ('signal', 'schedule', 'web')),
  time_range          TEXT NOT NULL,
  story_count_target  INT NOT NULL,
  word_count_target   INT NOT NULL,
  audience_context    TEXT,
  status              TEXT NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running', 'suspended_gate1', 'suspended_gate2',
                                        'suspended_hold', 'completed', 'failed', 'cancelled')),
  approved_story_ids  TEXT[],
  content_item_id     UUID REFERENCES content_items(id) ON DELETE SET NULL,
  requested_by        UUID REFERENCES team_members(id),
  requested_by_signal TEXT,
  shortlist           JSONB DEFAULT '[]',
  editorial_scores    JSONB DEFAULT '{}',
  total_word_count    INT,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes               TEXT
);

CREATE INDEX IF NOT EXISTS newsletter_runs_status_idx ON newsletter_runs (status);
CREATE INDEX IF NOT EXISTS newsletter_runs_signal_idx ON newsletter_runs (requested_by_signal);
CREATE INDEX IF NOT EXISTS newsletter_runs_started_idx ON newsletter_runs (started_at DESC);

CREATE OR REPLACE TRIGGER newsletter_runs_updated_at
  BEFORE UPDATE ON newsletter_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE newsletter_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "newsletter_runs_read" ON newsletter_runs;
CREATE POLICY "newsletter_runs_read" ON newsletter_runs
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

DROP POLICY IF EXISTS "newsletter_runs_write" ON newsletter_runs;
CREATE POLICY "newsletter_runs_write" ON newsletter_runs
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));

-- Realtime so the /content page can show in-progress run status.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE newsletter_runs;
EXCEPTION WHEN others THEN NULL; END $$;
