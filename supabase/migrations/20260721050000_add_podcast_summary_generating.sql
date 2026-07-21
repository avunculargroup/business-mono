-- ============================================================
-- Podcast episodes — durable brief-generation state
-- ============================================================
-- The "Generate brief" button hands off to the agent server asynchronously
-- (web writes pending_action = 'summarize'; podcastActionListener runs the
-- intelligence pass and writes summary_status = 'proposed' when done). Until now
-- the only "generating…" indicator was client-local React state, lost the moment
-- the director navigated away or reloaded — so an in-flight (or failed) run just
-- reverted to the bare "Generate brief" button, looking as if nothing happened.
--
-- Two terminal-and-transient states make that feedback durable:
--   generating — the pass has been requested and is running (survives reload)
--   failed     — the pass could not produce a brief (surfaces instead of a silent
--                revert; the director can retry)
--
-- Lifecycle: none → generating → proposed → approved
--                      generating → failed (retry → generating)
--                      proposed → none (reject)
-- ============================================================

ALTER TABLE podcast_episodes DROP CONSTRAINT IF EXISTS podcast_episodes_summary_status_check;
ALTER TABLE podcast_episodes ADD CONSTRAINT podcast_episodes_summary_status_check
  CHECK (summary_status IN ('none', 'generating', 'proposed', 'approved', 'failed'));
