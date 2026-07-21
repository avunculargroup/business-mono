-- ============================================================
-- Podcast episodes — episode intelligence (Phase 3: chapters)
-- ============================================================
-- Extends the episode-intelligence pass (podcast-pages-review B1 Phase 3 / P1-5)
-- with chapters: an ordered list of { title, start_seconds } that turns a
-- 90-minute transcript from a wall into a navigable document and backs a chapter
-- rail on the episode page (jump to "Custody", "Regulation", "Q&A").
--
-- Generated alongside the summary + takeaways by roger, from the timestamped
-- transcript; each chapter's start is snapped to a real transcript-segment start.
-- Chapters are a navigational aid over client-visible content, so they ride the
-- SAME summary_status publish-wall as the summary/takeaways.
-- ============================================================

-- [{ "title": string, "start_seconds": number }] in chronological order. Non-null
-- and defaulted so the read surface is always an array.
ALTER TABLE podcast_episodes ADD COLUMN IF NOT EXISTS chapters JSONB NOT NULL DEFAULT '[]'::jsonb;
