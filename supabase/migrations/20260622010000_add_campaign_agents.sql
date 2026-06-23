-- ============================================================
-- Campaign agents — register Margot and Lex in the agent_name CHECKs
-- ============================================================
-- Step 5 of the Social Campaigns build (CAMPAIGNS_BUILD_ORDER.md). Margot (the
-- marketer / strategist) is a new first-class agent and logs to agent_activity,
-- so the agent_name CHECK constraints that gate the audit trail, the capability
-- registry, and the routines table must accept it. 'lex' (the shared compliance
-- officer) was already added to agent_activity + platform_capabilities by the
-- on-chain indicators feature (20260621170002); re-declaring the constraint here
-- with both keeps margot + lex and also extends lex to the routines table. Each
-- is a strict superset of the existing constraint, so it is safe against
-- existing rows.
--
-- (The newsletter 'editor' agent is intentionally NOT added — it is internal to
-- the newsletter workflow and does not log to agent_activity directly.)
-- ============================================================

ALTER TABLE agent_activity
  DROP CONSTRAINT IF EXISTS agent_activity_agent_name_check;
ALTER TABLE agent_activity
  ADD CONSTRAINT agent_activity_agent_name_check
  CHECK (agent_name IN (
    'simon', 'roger', 'archie', 'petra', 'bruno', 'charlie', 'rex', 'della',
    'margot', 'lex'));

ALTER TABLE platform_capabilities
  DROP CONSTRAINT IF EXISTS platform_capabilities_agent_name_check;
ALTER TABLE platform_capabilities
  ADD CONSTRAINT platform_capabilities_agent_name_check
  CHECK (agent_name IN (
    'simon', 'roger', 'archie', 'petra', 'bruno', 'charlie', 'rex', 'della',
    'margot', 'lex'));

ALTER TABLE routines
  DROP CONSTRAINT IF EXISTS routines_agent_name_check;
ALTER TABLE routines
  ADD CONSTRAINT routines_agent_name_check
  CHECK (agent_name IN (
    'simon', 'roger', 'archie', 'petra', 'bruno', 'charlie', 'rex', 'della',
    'margot', 'lex'));
