-- ============================================================
-- Enable Supabase Realtime for the campaign gate tables
-- ============================================================
-- The Social Campaigns web→agents handoff is entirely Realtime-driven: the web
-- app can't reach the agents server over HTTP, so it writes the director's
-- decision into a `pending_decision` JSONB column and a listener on the agents
-- server reacts via postgres_changes.
--
--   * campaigns      — strategyGateWeb listener. The /campaigns wizard writes
--                      { decision: 'start' } to launch Margot's strategy run, and
--                      gate resume payloads to advance Gates 1 & 2.
--   * content_items  — variantGateWeb listener. The variant editor writes the
--                      Gate 3 approve / request-change decision.
--
-- Neither table was ever added to the supabase_realtime publication, so those
-- writes emitted no Realtime event: the listeners never fired, the strategy run
-- never launched, and the campaign detail page sat on "Margot is working…"
-- indefinitely. Add both to the publication so the events are delivered.
--
-- REPLICA IDENTITY FULL ensures the full row (including the JSONB gate columns
-- gate_state / pending_decision the handlers read) is included in the Realtime
-- payload — the same convention as agent_activity.
-- ============================================================

ALTER TABLE campaigns REPLICA IDENTITY FULL;
ALTER TABLE content_items REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE campaigns;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- already in publication, nothing to do
END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE content_items;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- already in publication, nothing to do
END;
$$;
