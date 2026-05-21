-- Per-agent and per-workflow-step model overrides.
--
-- The agent server resolves a LanguageModel for each invocation by checking
-- this table for the most specific scope_key, falling back to a parent scope
-- (e.g. workflow step → owning agent), then to the env-var default.
--
-- scope_type lets the settings UI group rows; scope_key is the canonical
-- identifier used at resolve time. Examples:
--   ('agent',          'simon')
--   ('workflow_step',  'recorder.identify_speakers')

CREATE TABLE model_configs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type  TEXT        NOT NULL CHECK (scope_type IN ('agent', 'workflow_step')),
  scope_key   TEXT        NOT NULL UNIQUE,
  model_id    TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_model_configs_scope_key ON model_configs (scope_key);

ALTER TABLE model_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "model_configs_authenticated_read"
  ON model_configs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "model_configs_authenticated_write"
  ON model_configs FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION set_model_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER model_configs_updated_at
  BEFORE UPDATE ON model_configs
  FOR EACH ROW
  EXECUTE FUNCTION set_model_configs_updated_at();
