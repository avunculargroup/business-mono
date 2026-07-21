-- ============================================================
-- v_episode_library — the client-safe reader view over podcast_episodes
-- ============================================================
-- The Q1/D2 boundary from podcast-pages-review: a view that exposes ONLY
-- approved, client-safe fields, so a reader surface physically cannot render
-- ops internals (transcript_error, Deepgram ids, transcript_source, pending_action)
-- or an unapproved brief. The ops/client split is enforced in the data layer, not
-- just in components.
--
--   * WHERE summary_status = 'approved'  → the publish-wall, at the data layer:
--     only episodes whose brief a human approved appear at all.
--   * Columns are the reader payload — brief, takeaways, chapters, category,
--     relevance, playback urls, artwork — and nothing operational.
--
-- Built for the internal browse view now (/news/podcasts/library, behind team
-- auth). When an external client portal is added later, THIS view is what gets
-- granted to the client role — the base table never is — so the portal is a
-- config change, not a refactor.
-- ============================================================

CREATE OR REPLACE VIEW v_episode_library AS
SELECT
  e.id,
  e.slug,
  e.title,
  e.published_at,
  e.image_url,
  e.duration_seconds,
  e.youtube_url,
  e.audio_url,
  e.episode_summary,
  e.key_takeaways,
  e.chapters,
  e.category,
  e.relevance_score,
  e.topic_tags,
  s.name AS source_name
FROM podcast_episodes e
LEFT JOIN news_sources s ON s.id = e.source_id
WHERE e.summary_status = 'approved';

COMMENT ON VIEW v_episode_library IS
  'Client-safe reader view: approved episodes only, no ops internals. The Q1/D2 boundary for the podcast library (podcast-pages-review).';
