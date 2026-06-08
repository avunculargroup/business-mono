-- ============================================================
-- Podcast episodes — web-requested re-run actions
-- ============================================================
-- The web episode list/detail exposes per-row actions (re-run the transcript
-- waterfall, force Deepgram, retry a failure). The web app can't reach the
-- agents server over HTTP, so — mirroring the newsletter gate pattern
-- (newsletter_runs.pending_decision) — it writes the requested action to this
-- column. podcastActionListener reacts via Supabase Realtime, claims the
-- action atomically (conditional clear), and re-resolves that one episode.
--
-- See docs/podcast-ingestion-spec.md §"Web App" and
-- apps/agents/src/listeners/podcastActionListener.ts.
-- ============================================================

ALTER TABLE podcast_episodes ADD COLUMN IF NOT EXISTS pending_action TEXT
  CHECK (pending_action IN ('refetch', 'deepgram', 'retry'));
