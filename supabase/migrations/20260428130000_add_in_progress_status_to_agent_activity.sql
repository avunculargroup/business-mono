-- Add 'in_progress' to agent_activity status CHECK constraint.
-- Also canonicalises 'error' (used throughout the codebase but absent from
-- the original CHECK) and 'agent' trigger_type (same situation).

ALTER TABLE agent_activity
  DROP CONSTRAINT IF EXISTS agent_activity_status_check;

ALTER TABLE agent_activity
  ADD CONSTRAINT agent_activity_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'auto', 'in_progress', 'error'));

ALTER TABLE agent_activity
  DROP CONSTRAINT IF EXISTS agent_activity_trigger_type_check;

ALTER TABLE agent_activity
  ADD CONSTRAINT agent_activity_trigger_type_check
  CHECK (trigger_type IN (
    'call_transcript', 'signal_message', 'manual', 'scheduled', 'agent'
  ));
