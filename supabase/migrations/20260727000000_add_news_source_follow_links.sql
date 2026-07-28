-- ============================================================
-- Newsletter link following: per-source opt-in
-- ============================================================
-- Research newsletters are often link roundups — the substance sits
-- behind the links, not in the email body. These two columns let a
-- source opt into having those links fetched and ingested as their
-- own news_items rows (see researchMailListener.ingestNewsletterLinks).
--
-- Default OFF: each followed link costs a Jina fetch plus two LLM
-- calls, so no existing source starts spending on deploy. The upper
-- bound on max_followed_links is a guardrail against a typo in the
-- source form turning one poll cycle into hundreds of LLM calls.
--
-- Not restricted to source_type='email' — the columns sit with the
-- other shared curation settings (tier, relevance_threshold) so an
-- RSS path could adopt them later without a second migration.
-- ============================================================

ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS follow_links BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS max_followed_links INT NOT NULL DEFAULT 5;

ALTER TABLE news_sources DROP CONSTRAINT IF EXISTS news_sources_max_followed_links_check;
ALTER TABLE news_sources ADD CONSTRAINT news_sources_max_followed_links_check
  CHECK (max_followed_links >= 0 AND max_followed_links <= 20);

COMMENT ON COLUMN news_sources.follow_links IS
  'When true, links inside an ingested item are fetched and ingested as their own news_items rows.';
COMMENT ON COLUMN news_sources.max_followed_links IS
  'Per-item cap on followed links. A global per-poll-cycle cap also applies in the listener.';
