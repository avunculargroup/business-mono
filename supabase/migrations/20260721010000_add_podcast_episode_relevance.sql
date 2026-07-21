-- ============================================================
-- Podcast episodes — episode intelligence (relevance score + category)
-- ============================================================
-- Extends the episode-intelligence pass (podcast-pages-review B1 / Q3
-- resolution) so an episode carries the same relevance lens as news_items: a
-- composite relevance_score plus a category, letting the library later sort
-- "most relevant to treasury first" rather than "most recently published".
--
-- Reuses Rex's news rubric ENGINE (material/novelty/citation, composite computed
-- in code) with a podcast-tuned prompt (rubric_version 'podcast-v1'), scored per
-- episode from its brief (summary + takeaways) — see
-- apps/agents/src/workflows/podcastRubric.ts.
--
-- Unlike the summary/takeaways, relevance is director/ops metadata (a score and a
-- classification), NOT client-visible prose — so it is written immediately and
-- does NOT ride the summary_status publish-wall or Lex review.
--
-- category mirrors the four NewsCategory values (packages/shared/src/news.ts).
-- Nullable throughout: an episode is unscored until the pass runs (or if scoring
-- fails).
-- ============================================================

ALTER TABLE podcast_episodes ADD COLUMN IF NOT EXISTS relevance_score NUMERIC(3,2);
ALTER TABLE podcast_episodes ADD COLUMN IF NOT EXISTS category TEXT
  CHECK (category IS NULL OR category IN ('regulatory', 'corporate', 'macro', 'international'));
-- Dimension scores, flags, reasoning, and rubric_version — mirrors news_items.rex_metadata.
ALTER TABLE podcast_episodes ADD COLUMN IF NOT EXISTS relevance_metadata JSONB;
