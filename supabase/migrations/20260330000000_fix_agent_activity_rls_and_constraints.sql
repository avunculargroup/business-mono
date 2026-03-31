-- Three bugs that block agents from writing to the audit trail:
--
-- 1. RLS policies on agent_activity, platform_capabilities, and capacity_gaps
--    only allow auth.role() = 'authenticated'. The Mastra server uses the
--    service_role key, so all agent inserts were silently blocked.
--
-- 2. agent_activity and platform_capabilities CHECK constraints on agent_name
--    did not include 'della' (Relationship Manager). Any insert from the
--    Della listener would fail with a constraint violation.
--
-- 3. Recorder and PM workflows wrote the pre-rename names ('recorder', 'pm')
--    which were rejected by the CHECK constraint that expects 'roger'/'petra'.
--    Fixed in TypeScript source — this migration handles the DB side only.

-- ── Fix 1: Add service_role to RLS policies ───────────────────────────────────

DROP POLICY IF EXISTS "agent_activity_all" ON agent_activity;
CREATE POLICY "agent_activity_all" ON agent_activity
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));

DROP POLICY IF EXISTS "platform_capabilities_all" ON platform_capabilities;
CREATE POLICY "platform_capabilities_all" ON platform_capabilities
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));

DROP POLICY IF EXISTS "capacity_gaps_all" ON capacity_gaps;
CREATE POLICY "capacity_gaps_all" ON capacity_gaps
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));

-- ── Fix 2: Add 'della' to agent_name CHECK constraints ───────────────────────

ALTER TABLE agent_activity
  DROP CONSTRAINT IF EXISTS agent_activity_agent_name_check;
ALTER TABLE agent_activity
  ADD CONSTRAINT agent_activity_agent_name_check
  CHECK (agent_name IN ('simon', 'roger', 'archie', 'petra', 'bruno', 'charlie', 'rex', 'della'));

ALTER TABLE platform_capabilities
  DROP CONSTRAINT IF EXISTS platform_capabilities_agent_name_check;
ALTER TABLE platform_capabilities
  ADD CONSTRAINT platform_capabilities_agent_name_check
  CHECK (agent_name IN ('simon', 'roger', 'archie', 'petra', 'bruno', 'charlie', 'rex', 'della'));
