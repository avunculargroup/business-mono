-- ============================================================
-- Podcast episodes — episode intelligence (Phase 1: summary)
-- ============================================================
-- The "episode intelligence pass" (podcast-pages-review P0-1) adds a synthesis
-- layer over a raw transcript: an agent-written summary that a client can read
-- instead of a 90-minute transcript. Phase 1 is summary-only. It ships behind a
-- publish-wall — the summary is generated as 'proposed' and only becomes
-- client-visible once a human approves it (summary_status = 'approved').
--
-- roger (Recorder) narrates the summary; lex reviews it for AFSL/AR advice risk
-- (its verdict is stored on the row for the director + logged to agent_activity).
-- Both already sit in the agent_activity.agent_name CHECK, so no CHECK change is
-- needed there.
--
-- See docs/reviews/podcast-pages-review §B1/D3 and
-- apps/agents/src/workflows/podcastIntel/.
-- ============================================================

-- Synthesised brief + its lifecycle. The draft text lives in episode_summary the
-- whole time; summary_status gates whether it is client-visible.
ALTER TABLE podcast_episodes ADD COLUMN IF NOT EXISTS episode_summary TEXT;
ALTER TABLE podcast_episodes ADD COLUMN IF NOT EXISTS summary_status TEXT NOT NULL DEFAULT 'none'
  CHECK (summary_status IN ('none', 'proposed', 'approved'));
-- Lex's structured verdict (passes / flags / rationale / suggested_rewrite) so the
-- director sees the compliance signal at the approval wall.
ALTER TABLE podcast_episodes ADD COLUMN IF NOT EXISTS summary_lex_verdict JSONB;
ALTER TABLE podcast_episodes ADD COLUMN IF NOT EXISTS summary_generated_at TIMESTAMPTZ;
ALTER TABLE podcast_episodes ADD COLUMN IF NOT EXISTS summary_approved_at TIMESTAMPTZ;
ALTER TABLE podcast_episodes ADD COLUMN IF NOT EXISTS summary_approved_by UUID REFERENCES team_members(id);

-- Widen the web-action CHECK to accept 'summarize' — the episode page's "Generate
-- brief" button writes it, podcastActionListener claims it and runs the pass.
ALTER TABLE podcast_episodes DROP CONSTRAINT IF EXISTS podcast_episodes_pending_action_check;
ALTER TABLE podcast_episodes ADD CONSTRAINT podcast_episodes_pending_action_check
  CHECK (pending_action IN ('refetch', 'deepgram', 'retry', 'summarize'));
