-- ── Add Lex, the compliance agent, to the roster ─────────────────────────────
-- Session 4 of the On-Chain Indicators feature. On-chain valuation metrics
-- (MVRV, realised price, Hash Ribbons) are the platform's highest advice-risk
-- surface — BTS operates under an AFSL/AR. Lex reviews content drafts that frame
-- these (or any) metrics and flags anything that reads as a buy/sell signal or
-- price prediction. Its verdicts are logged under its OWN name so the audit
-- trail is meaningful for compliance, which is why it joins the agent_name CHECK
-- (unlike the internal newsletter editor, which logs under charlie).
-- See docs/agents/compliance.md.

-- Widen the agent_name CHECK on both tables to include 'lex'.
ALTER TABLE agent_activity DROP CONSTRAINT IF EXISTS agent_activity_agent_name_check;
ALTER TABLE agent_activity
  ADD CONSTRAINT agent_activity_agent_name_check
  CHECK (agent_name IN ('simon', 'roger', 'archie', 'petra', 'bruno', 'charlie', 'rex', 'della', 'lex'));

ALTER TABLE platform_capabilities DROP CONSTRAINT IF EXISTS platform_capabilities_agent_name_check;
ALTER TABLE platform_capabilities
  ADD CONSTRAINT platform_capabilities_agent_name_check
  CHECK (agent_name IN ('simon', 'roger', 'archie', 'petra', 'bruno', 'charlie', 'rex', 'della', 'lex'));

-- Seed Lex's capability (idempotent on agent_name + capability).
INSERT INTO platform_capabilities (agent_name, capability, status, phase, tools_required, notes)
SELECT 'lex', 'content_compliance_review', 'active', 'phase_1', ARRAY[]::text[],
       'Reviews content drafts (esp. on-chain valuation framing) for advice-vs-context under AFSL/AR. Flags buy/sell signals and price predictions; logs a verdict to agent_activity. Advisory — never replaces human approval.'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_capabilities c
  WHERE c.agent_name = 'lex' AND c.capability = 'content_compliance_review'
);
