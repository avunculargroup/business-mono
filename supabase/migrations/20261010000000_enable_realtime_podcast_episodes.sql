-- ============================================================
-- Enable Supabase Realtime for podcast_episodes
-- ============================================================
-- The /news/podcasts per-row actions (Fetch transcript / Transcribe with
-- Deepgram / Retry / Summarize) write podcast_episodes.pending_action, and
-- podcastActionListener on the agents server reacts via postgres_changes.
--
-- The table was never added to the supabase_realtime publication, so those
-- writes emitted no event. Actions only ran when the listener's 5-minute
-- reconcile sweep found them, leaving rows on "Resolving…" for up to 5 minutes.
--
-- REPLICA IDENTITY is deliberately left at DEFAULT (unlike campaigns /
-- content_items). The handler reads only payload.new.id and
-- payload.new.pending_action, both small and never TOASTed, so DEFAULT already
-- delivers them. FULL would write the whole old row — including transcript_text
-- and fts — to WAL on every update, for no benefit.
-- ============================================================

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE podcast_episodes;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- already in publication, nothing to do
END;
$$;
