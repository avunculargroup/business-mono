-- Add 'mastra-span' to the agent_activity trigger_type CHECK constraint.
-- The AgentActivitySpanProcessor (apps/agents/src/observability/agentActivityProcessor.ts)
-- mirrors Mastra spans into agent_activity using trigger_type = 'mastra-span',
-- which the previous constraint rejected, causing every span insert to fail.

ALTER TABLE agent_activity
  DROP CONSTRAINT IF EXISTS agent_activity_trigger_type_check;

ALTER TABLE agent_activity
  ADD CONSTRAINT agent_activity_trigger_type_check
  CHECK (trigger_type IN (
    'call_transcript', 'signal_message', 'manual', 'scheduled', 'agent', 'mastra-span'
  ));
