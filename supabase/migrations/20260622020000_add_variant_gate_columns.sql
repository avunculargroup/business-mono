-- ============================================================
-- Variant gate columns — web approval path for the variant workflow
-- ============================================================
-- Step 6 of the Social Campaigns build (CAMPAIGNS_BUILD_ORDER.md). The Variant
-- Generation workflow suspends at Gate 3 for human approval. The /campaigns
-- variant editor can't reach the agents server over HTTP, so — exactly like the
-- newsletter web gate (newsletter_runs.gate_message / pending_decision) — the
-- suspended gate context and the web→agents decision handoff live on the
-- content_item (which IS the variant):
--
--   * workflow_run_id  — the Mastra run to resume (set when the gate suspends).
--   * gate_state       — the suspend preview payload the editor renders.
--   * pending_decision — the web writes the approve / request-change decision
--                        here; variantGateWeb listener claims it and resumes.
--
-- All nullable, so existing non-variant content_items are unaffected.
-- ============================================================

ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS workflow_run_id  TEXT,
  ADD COLUMN IF NOT EXISTS gate_state       JSONB,
  ADD COLUMN IF NOT EXISTS pending_decision JSONB;
