-- Enable Supabase Realtime for agent_activity so that listeners
-- (pm, ba, content creator, etc.) receive INSERT events via postgres_changes.
-- REPLICA IDENTITY FULL ensures the full row (including JSONB columns like
-- proposed_actions) is included in the Realtime payload.
ALTER TABLE agent_activity REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE agent_activity;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- already in publication, nothing to do
END;
$$;
