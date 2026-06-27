-- workflow_progress: one row per in-progress workflow run, holding the current
-- step's human-readable label. Shared across any Mastra workflow (newsletter,
-- campaign strategy, and future ones) so the web app can show "Margot is
-- drafting the strategy…" style granularity without per-feature columns. Rows
-- are upserted at the start of each step and deleted once the run suspends at
-- a gate or reaches a terminal state — a missing row just means "no step in
-- flight right now" (gate UI / terminal status takes over).

CREATE TABLE IF NOT EXISTS workflow_progress (
  workflow_run_id TEXT PRIMARY KEY,
  step_id         TEXT NOT NULL,
  step_label      TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER workflow_progress_updated_at
  BEFORE UPDATE ON workflow_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE workflow_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workflow_progress_read" ON workflow_progress;
CREATE POLICY "workflow_progress_read" ON workflow_progress
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

DROP POLICY IF EXISTS "workflow_progress_write" ON workflow_progress;
CREATE POLICY "workflow_progress_write" ON workflow_progress
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));

ALTER TABLE workflow_progress REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE workflow_progress;
EXCEPTION WHEN others THEN NULL; END $$;
