-- ============================================================
-- Email newsletter sources + Rex relevance rubric
-- ============================================================
-- Extends the existing news ingestion stack to a third source type: paid
-- email newsletters that never surface via RSS or podcast feeds (Gromen
-- Tree Rings, Bitwise CIO memos, Fidelity Digital Assets, Lyn Alden
-- Premium, ...). These arrive at per-source plus-addresses
-- (research+{slug}@<domain>) filed into a dedicated Fastmail folder; a
-- listener polls that folder and feeds each message into the SAME
-- news_items table the RSS/podcast pipeline already populates.
--
-- This migration adds:
--   1. 'email' to news_sources.source_type + email-specific columns
--      (slug, inbound_address, sender_allowlist) and shared curation
--      fields (tier, relevance_threshold) used by the Rex rubric.
--   2. news_items columns to attribute an item to a configured source
--      (source_id), dedupe email by Message-ID (ingestion_ref), keep the
--      real "view in browser" link (canonical_url), and store the Rex
--      rubric output (relevance_reasoning, curator_notes, rex_metadata)
--      plus email metadata (author, attachment flags).
--   3. Fastmail config for the research-folder poll (research_folder on
--      accounts, research_query_state on sync state).
--
-- Email ingestion is listener-driven (see researchMailListener), NOT a
-- cron routine, so routines.action_type is unchanged here.
--
-- See docs/news-source-email-spec.md.
-- ============================================================

-- ── Extend news_sources: email source type + curation fields ──────────────────

ALTER TABLE news_sources DROP CONSTRAINT IF EXISTS news_sources_source_type_check;
ALTER TABLE news_sources ADD CONSTRAINT news_sources_source_type_check
  CHECK (source_type IN ('rss', 'podcast', 'youtube', 'email'));

-- Email routing. slug is the plus-address suffix and URL slug; inbound_address
-- is the computed research+{slug}@<domain> the newsletter is subscribed with;
-- sender_allowlist is the set of approved From addresses/domains (may start
-- empty — the first email seeds it via the "Trust this sender" affordance).
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS slug             TEXT;
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS inbound_address  TEXT;
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS sender_allowlist TEXT[] NOT NULL DEFAULT '{}';

-- Shared curation fields used by the Rex relevance rubric across all source
-- types. tier drives visual prominence; relevance_threshold is the per-source
-- floor above which an item is elevated in the feed.
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS tier TEXT
  CHECK (tier IS NULL OR tier IN ('tier_1', 'tier_2', 'tier_3'));
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS relevance_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.70;

-- slug is unique where present (NULLs coexist for legacy rss/podcast rows).
CREATE UNIQUE INDEX IF NOT EXISTS news_sources_slug_uniq
  ON news_sources (slug) WHERE slug IS NOT NULL;

-- Per-type presence: email sources need an inbound_address (and no feed_url),
-- extending the rss/podcast/youtube constraint added by the podcast migration.
ALTER TABLE news_sources DROP CONSTRAINT IF EXISTS news_sources_feed_required;
ALTER TABLE news_sources ADD CONSTRAINT news_sources_feed_required
  CHECK ( (source_type IN ('rss', 'podcast') AND feed_url IS NOT NULL)
       OR (source_type = 'youtube' AND youtube_channel_url IS NOT NULL)
       OR (source_type = 'email' AND inbound_address IS NOT NULL) );

-- ── Extend news_items: source attribution, email dedupe, Rex rubric ───────────

-- Attribute an item to a configured source. Legacy rows link by source_name
-- text only; email (and going forward, all) items carry the FK.
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS source_id UUID
  REFERENCES news_sources(id) ON DELETE SET NULL;

-- Idempotency key for email ingestion (the RFC 5322 Message-ID). Dedup runs on
-- this BEFORE the existing URL + semantic-embedding dedup. RSS/podcast items
-- leave it NULL and continue to dedupe on url.
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS ingestion_ref TEXT;

-- Real "view in browser" / original link for an email item. news_items.url is
-- NOT NULL UNIQUE and many newsletters have no stable URL, so ingestion
-- synthesizes a stable url from the Message-ID and keeps the human link here.
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS canonical_url TEXT;

-- Email metadata.
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS author             TEXT;
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS has_pdf_attachment BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS attachment_count   INT     NOT NULL DEFAULT 0;

-- Rex relevance rubric output. relevance_reasoning is the candid internal
-- justification; curator_notes is pre-filled with Rex's suggestion and edited
-- by a human; rex_metadata holds dimension scores, flags, and rubric_version.
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS relevance_reasoning TEXT;
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS curator_notes       TEXT;
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS rex_metadata        JSONB NOT NULL DEFAULT '{}'::jsonb;

-- One item per (source, Message-ID). NULLs are distinct in Postgres, so legacy
-- rows without an ingestion_ref are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS news_items_source_ingestion_ref_uniq
  ON news_items (source_id, ingestion_ref) WHERE ingestion_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS news_items_source_idx ON news_items (source_id);

-- ── Fastmail: research-folder poll config ─────────────────────────────────────
-- research_folder names a Fastmail folder whose messages are research
-- newsletters (NOT CRM mail) — the researchMailListener polls it separately
-- from the Inbox/Sent CRM sync and never creates interactions/Della dispatches.

ALTER TABLE fastmail_accounts   ADD COLUMN IF NOT EXISTS research_folder      TEXT;
ALTER TABLE fastmail_sync_state ADD COLUMN IF NOT EXISTS research_query_state TEXT;
