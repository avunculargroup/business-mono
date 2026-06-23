-- ============================================================
-- Campaign gate columns — web approval path for the strategy workflow
-- ============================================================
-- Step 7 of the Social Campaigns build (CAMPAIGNS_BUILD_ORDER.md). The Campaign
-- Strategy workflow suspends at TWO human gates: Gate 1 (strategy review) and
-- Gate 2 (beat plan + schedule review). The /campaigns wizard can't reach the
-- agents server over HTTP, so — exactly like the variant Gate 3
-- (content_items.gate_state / pending_decision) and the newsletter web gate —
-- the suspended gate context and the web→agents handoff live on the campaign
-- row (the campaign IS the gate's home):
--
--   * workflow_run_id  — the Mastra run to resume (set when a gate suspends).
--   * gate_state       — the suspend payload the wizard renders (which gate +
--                        the strategy or the beat plan + calendar).
--   * pending_decision — the web writes the director's decision here:
--                        { decision: 'start' } to launch the run (no run id yet),
--                        or a gate resume payload; strategyGateWeb claims it and
--                        starts/resumes the workflow.
--   * schedule_plan    — the approved (beat × account) schedule across slots,
--                        persisted on Gate 2 approval for Step 8 fan-out to read.
--
-- All nullable, so existing campaigns are unaffected.
-- ============================================================

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS workflow_run_id  TEXT,
  ADD COLUMN IF NOT EXISTS gate_state       JSONB,
  ADD COLUMN IF NOT EXISTS pending_decision JSONB,
  ADD COLUMN IF NOT EXISTS schedule_plan    JSONB;
