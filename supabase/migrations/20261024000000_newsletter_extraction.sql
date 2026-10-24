-- ============================================================
-- NEWSLETTER CONTENT EXTRACTION & LINK FOLLOWING
-- Spec: docs/news-source-email-extraction-spec.md
-- Build notes: docs/news-source-email-extraction-build-progress.md
-- ============================================================
-- Depends on: 20260910000000_rls_hardening.sql (is_team_member)
--
--   1. news_item_raw keeps each email body as received, so extraction can be
--      re-run as the cleaner improves. It holds subscriber tokens by nature,
--      so it gets a team policy and nothing else — never a subscriber policy,
--      never a client read model.
--   2. news_sources gains per-source link-following rules, applied to the
--      real destination of each link before any fetch or LLM call.
--   3. news_items.body_truncated marks a body the HTML or Jina cap cut.
--   4. news_items_backfill_snapshot holds the original url, canonical_url,
--      ingestion_ref, body and score of every row the one-off backfill
--      (apps/agents/src/scripts/backfillNewsletterContent.ts) touches. It holds
--      the same tokens the backfill removes: drop it in a follow-up migration
--      once the acceptance queries pass.
--   5. Seeking Alpha stops following links: 1,031 followed items averaged a
--      score of 0.10, and 21 reached 0.5. The spec's open question proposes
--      off; turn it back on, or set an allow pattern, from /news/sources.
-- ============================================================

CREATE TABLE news_item_raw (
  news_item_id      UUID PRIMARY KEY REFERENCES news_items(id) ON DELETE CASCADE,
  format            TEXT NOT NULL CHECK (format IN ('html', 'text')),
  raw               TEXT NOT NULL,
  raw_chars         INT  NOT NULL,
  extractor_version TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE news_item_raw IS
  'Email body as received, for re-running extraction. Carries subscriber tokens: team-only, never exposed to a subscriber.';
COMMENT ON COLUMN news_item_raw.raw_chars IS
  'Length before the 1 MB cap on raw, so a truncated copy is visible.';
COMMENT ON COLUMN news_item_raw.extractor_version IS
  'Version of the cleaner that produced the current news_items.body_markdown (EMAIL_EXTRACTOR_VERSION).';

ALTER TABLE news_item_raw ENABLE ROW LEVEL SECURITY;

-- Team only. The agents server writes with the service role.
CREATE POLICY news_item_raw_team ON news_item_raw
  FOR ALL USING (is_team_member()) WITH CHECK (is_team_member());

ALTER TABLE news_sources
  ADD COLUMN IF NOT EXISTS link_allow_patterns TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS link_deny_patterns  TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS link_extract_config JSONB  NOT NULL DEFAULT '{}';

COMMENT ON COLUMN news_sources.link_allow_patterns IS
  'Host or host-plus-path prefixes (seekingalpha.com/article/). When non-empty, a followed link must match one.';
COMMENT ON COLUMN news_sources.link_deny_patterns IS
  'Host or host-plus-path prefixes never followed, checked after the global deny lists.';
COMMENT ON COLUMN news_sources.link_extract_config IS
  'Per-source Jina options for followed links: { "targetSelector"?: string, "removeSelector"?: string }.';

ALTER TABLE news_items
  ADD COLUMN IF NOT EXISTS body_truncated BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE news_items_backfill_snapshot (
  id              UUID PRIMARY KEY,
  url             TEXT NOT NULL,
  canonical_url   TEXT,
  ingestion_ref   TEXT,
  body_markdown   TEXT,
  relevance_score NUMERIC(3,2),
  status          TEXT,
  snapshot_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE news_items_backfill_snapshot IS
  'Pre-backfill copy of news_items rows changed by backfillNewsletterContent. Holds subscriber tokens; temporary — drop after verification.';

ALTER TABLE news_items_backfill_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY news_items_backfill_snapshot_team ON news_items_backfill_snapshot
  FOR ALL USING (is_team_member()) WITH CHECK (is_team_member());

UPDATE news_sources
   SET follow_links = false
 WHERE source_type = 'email'
   AND slug = 'seekingalpha';
