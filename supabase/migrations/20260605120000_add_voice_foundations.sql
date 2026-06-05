-- ============================================================
-- Voice foundations — social_accounts, brand_voice, voice_snippets
-- ============================================================
-- Step 1 of the Social Campaigns build (CAMPAIGNS_BUILD_ORDER.md). Establishes
-- the voice source-of-truth tables that the brand-voice migration and the
-- campaigns feature both build on:
--
--   * social_accounts  — the destinations a campaign posts from, each with a
--                        per-account voice_profile (umbrella + override model).
--   * brand_voice      — singleton company-voice canon (app-layer singleton,
--                        same pattern as company_profile). Seeded in Step 3.
--   * voice_snippets   — embeddable exemplar library; FKs social_accounts,
--                        which is why social_accounts must exist first.
--
-- Verified in Step 0 (CAMPAIGNS_STEP0_VERIFICATION.md):
--   * pgvector 0.8.0 is installed → HNSW (vector_cosine_ops) is valid and is
--     the project's established index form (knowledge_items, content_embeddings).
--   * platform values reuse the content_items.type vocabulary ('linkedin',
--     'twitter_x').
--   * RLS follows the project's real convention — authenticated AND service_role
--     (agents embed snippets via service_role), with a WITH CHECK clause — not
--     the simplified USING-only snippet in the spec.
--
-- Account seeding (Step 1 "done when") is applied separately once the real
-- handles/profile URLs are confirmed; this migration creates the structure.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ── social_accounts ───────────────────────────────────────────────────────────
-- A founder on X and the same founder on LinkedIn are SEPARATE rows: same
-- person, different voice and format. team_member_id is NULL for company
-- accounts, set for founder accounts.

CREATE TABLE IF NOT EXISTS social_accounts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform            TEXT        NOT NULL
                        CHECK (platform IN ('linkedin', 'twitter_x')),
  account_type        TEXT        NOT NULL
                        CHECK (account_type IN ('company', 'founder')),
  display_name        TEXT        NOT NULL,
  handle              TEXT,
  profile_url         TEXT,
  team_member_id      UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  voice_profile       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  is_active           BOOLEAN     NOT NULL DEFAULT true,
  api_credentials_ref TEXT,                              -- Phase 2: secret-store ref, never the secret
  created_by          UUID        REFERENCES team_members(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER social_accounts_updated_at
  BEFORE UPDATE ON social_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_social_accounts_platform ON social_accounts(platform);
CREATE INDEX IF NOT EXISTS idx_social_accounts_member   ON social_accounts(team_member_id);

ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "social_accounts_all" ON social_accounts;
CREATE POLICY "social_accounts_all" ON social_accounts
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ── brand_voice ───────────────────────────────────────────────────────────────
-- Singleton: one row holding the company voice canon. Singleton is enforced at
-- the application layer (same as company_profile) — no DB uniqueness constraint.
-- profile shares the social_accounts.voice_profile shape so one editor and one
-- validator serve both. bitcoin_capitalisation_rule is broken out as its own
-- column because it is a hard editorial rule applied across ALL agent output,
-- not a soft tone preference. Row content is seeded in Step 3 from brand-voice.md.

CREATE TABLE IF NOT EXISTS brand_voice (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile                     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  mission_summary             TEXT,
  bitcoin_capitalisation_rule TEXT,
  version                     TEXT        NOT NULL DEFAULT '1.0',
  is_active                   BOOLEAN     NOT NULL DEFAULT true,
  updated_by                  UUID        REFERENCES team_members(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER brand_voice_updated_at
  BEFORE UPDATE ON brand_voice
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE brand_voice ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "brand_voice_all" ON brand_voice;
CREATE POLICY "brand_voice_all" ON brand_voice
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ── voice_snippets ────────────────────────────────────────────────────────────
-- The exemplar library — concrete few-shot examples that demonstrate a voice
-- rather than describe it. Umbrella + override: social_account_id = NULL is
-- company canon (serves every voice); a scoped row is account-specific. At
-- retrieval an agent pulls BOTH the account's own snippets and company-canon
-- snippets. Embedded on save (and re-embedded when body changes).

CREATE TABLE IF NOT EXISTS voice_snippets (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  social_account_id      UUID        REFERENCES social_accounts(id) ON DELETE CASCADE,  -- NULL = company canon
  snippet_type           TEXT        NOT NULL
                           CHECK (snippet_type IN (
                             'phrase', 'opener', 'closer', 'transition',
                             'paragraph', 'full_post', 'cta')),
  body                   TEXT        NOT NULL,
  curator_note           TEXT,
  platform               TEXT        CHECK (platform IN ('linkedin', 'twitter_x')),  -- NULL = platform-agnostic
  topic_tags             TEXT[]      NOT NULL DEFAULT '{}',
  embedding              VECTOR(1536),
  is_starred             BOOLEAN     NOT NULL DEFAULT false,
  source                 TEXT        NOT NULL DEFAULT 'manual'
                           CHECK (source IN ('manual', 'promoted_from_post', 'agent')),
  source_content_item_id UUID        REFERENCES content_items(id) ON DELETE SET NULL,
  created_by             UUID        REFERENCES team_members(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER voice_snippets_updated_at
  BEFORE UPDATE ON voice_snippets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_voice_snippets_account ON voice_snippets(social_account_id);
CREATE INDEX IF NOT EXISTS idx_voice_snippets_type    ON voice_snippets(snippet_type);
CREATE INDEX IF NOT EXISTS idx_voice_snippets_tags    ON voice_snippets USING GIN (topic_tags);
CREATE INDEX IF NOT EXISTS idx_voice_snippets_starred ON voice_snippets(is_starred) WHERE is_starred;
-- Vector similarity: HNSW chosen in Step 0 (pgvector 0.8.0, read-heavy retrieval).
CREATE INDEX IF NOT EXISTS idx_voice_snippets_embedding ON voice_snippets
  USING hnsw (embedding vector_cosine_ops);

ALTER TABLE voice_snippets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "voice_snippets_all" ON voice_snippets;
CREATE POLICY "voice_snippets_all" ON voice_snippets
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ── Seed: social_accounts registry (PLACEHOLDERS) ─────────────────────────────
-- The build order wants company X, company LinkedIn, and each founder's X +
-- LinkedIn seeded. These rows are PLACEHOLDERS — display_name / handle /
-- profile_url are meant to be edited (in Brand Hub once it exists, or by SQL).
-- Each insert is idempotent on its natural key, so re-applying is safe and will
-- not clobber values the founders have since corrected.
--
-- Founder accounts attach to the two team_members by creation order (the
-- platform has exactly two co-founders). voice_profile defaults to '{}' and is
-- filled per account later (Step 3 / campaigns feature).

-- Company accounts (team_member_id NULL).
INSERT INTO social_accounts (platform, account_type, display_name, handle, profile_url)
SELECT 'twitter_x', 'company', 'BTS — Company (X)', '@placeholder_bts', 'https://x.com/placeholder_bts'
WHERE NOT EXISTS (
  SELECT 1 FROM social_accounts WHERE platform = 'twitter_x' AND account_type = 'company'
);

INSERT INTO social_accounts (platform, account_type, display_name, handle, profile_url)
SELECT 'linkedin', 'company', 'BTS — Company (LinkedIn)', 'placeholder-bts',
       'https://www.linkedin.com/company/placeholder-bts'
WHERE NOT EXISTS (
  SELECT 1 FROM social_accounts WHERE platform = 'linkedin' AND account_type = 'company'
);

-- Founder 1 (first team_member by creation order).
INSERT INTO social_accounts (platform, account_type, display_name, handle, profile_url, team_member_id, created_by)
SELECT 'twitter_x', 'founder', 'Founder 1 — placeholder (X)', '@placeholder_founder1',
       'https://x.com/placeholder_founder1', tm.id, tm.id
FROM (SELECT id FROM team_members ORDER BY created_at, id LIMIT 1 OFFSET 0) tm
WHERE NOT EXISTS (
  SELECT 1 FROM social_accounts sa
  WHERE sa.platform = 'twitter_x' AND sa.account_type = 'founder' AND sa.team_member_id = tm.id
);

INSERT INTO social_accounts (platform, account_type, display_name, handle, profile_url, team_member_id, created_by)
SELECT 'linkedin', 'founder', 'Founder 1 — placeholder (LinkedIn)', 'placeholder-founder1',
       'https://www.linkedin.com/in/placeholder-founder1', tm.id, tm.id
FROM (SELECT id FROM team_members ORDER BY created_at, id LIMIT 1 OFFSET 0) tm
WHERE NOT EXISTS (
  SELECT 1 FROM social_accounts sa
  WHERE sa.platform = 'linkedin' AND sa.account_type = 'founder' AND sa.team_member_id = tm.id
);

-- Founder 2 (second team_member by creation order).
INSERT INTO social_accounts (platform, account_type, display_name, handle, profile_url, team_member_id, created_by)
SELECT 'twitter_x', 'founder', 'Founder 2 — placeholder (X)', '@placeholder_founder2',
       'https://x.com/placeholder_founder2', tm.id, tm.id
FROM (SELECT id FROM team_members ORDER BY created_at, id LIMIT 1 OFFSET 1) tm
WHERE NOT EXISTS (
  SELECT 1 FROM social_accounts sa
  WHERE sa.platform = 'twitter_x' AND sa.account_type = 'founder' AND sa.team_member_id = tm.id
);

INSERT INTO social_accounts (platform, account_type, display_name, handle, profile_url, team_member_id, created_by)
SELECT 'linkedin', 'founder', 'Founder 2 — placeholder (LinkedIn)', 'placeholder-founder2',
       'https://www.linkedin.com/in/placeholder-founder2', tm.id, tm.id
FROM (SELECT id FROM team_members ORDER BY created_at, id LIMIT 1 OFFSET 1) tm
WHERE NOT EXISTS (
  SELECT 1 FROM social_accounts sa
  WHERE sa.platform = 'linkedin' AND sa.account_type = 'founder' AND sa.team_member_id = tm.id
);

