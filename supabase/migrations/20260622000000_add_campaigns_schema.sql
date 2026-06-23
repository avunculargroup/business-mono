-- ============================================================
-- Campaigns schema — strategy, beats, variants, compliance, metrics
-- ============================================================
-- Step 4 of the Social Campaigns build (CAMPAIGNS_BUILD_ORDER.md). The strategy
-- layer above the existing content pipeline. social_accounts / brand_voice /
-- voice_snippets already exist (Step 1, 20260605120000); this migration adds:
--
--   * campaigns           — strategy container + global cadence config.
--   * campaign_accounts   — which accounts a campaign fans out to.
--   * campaign_beats      — ordered platform-agnostic core messages.
--   * content_items (ALTER) — reused AS the variant: campaign/beat/account links,
--                           thread + compliance + approval state. source CHECK
--                           extended to include 'margot' and 'charlie'.
--   * thread_segments     — ordered child rows of a threaded variant.
--   * content_images      — images at variant or thread-segment level.
--   * platform_specs      — editable per-platform limits (X, LinkedIn seeded).
--   * compliance_snippets — keyed reusable disclaimers Lex selects from (seeded).
--   * post_metrics        — manual post-hoc performance numbers per published post.
--   * v_campaign_overview / v_campaign_matrix / v_ready_to_post views.
--
-- Conventions match the Step 1 migration: IF NOT EXISTS / CREATE OR REPLACE for
-- idempotency, update_updated_at() triggers, and RLS as authenticated OR
-- service_role with a WITH CHECK clause (agents write via service_role).
-- ============================================================

-- ── campaigns ─────────────────────────────────────────────────────────────────
-- The strategy container. strategy JSONB LOCKS at the application layer once the
-- plan is approved (status = plan_approved); major pivots require a new campaign.

CREATE TABLE IF NOT EXISTS campaigns (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT        NOT NULL,
  objective            TEXT,
  status               TEXT        NOT NULL DEFAULT 'draft'
                         CHECK (status IN (
                           'draft', 'strategy_approved', 'plan_approved',
                           'active', 'paused', 'completed', 'archived')),
  strategy             JSONB       NOT NULL DEFAULT '{}'::jsonb,
  audience_filter      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  audience_persona     TEXT,
  start_date           DATE,
  duration_weeks       INT,
  posts_per_week       INT,
  post_slots           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  timezone             TEXT        NOT NULL DEFAULT 'Australia/Melbourne',
  strategy_approved_at TIMESTAMPTZ,
  strategy_approved_by UUID        REFERENCES team_members(id),
  plan_approved_at     TIMESTAMPTZ,
  plan_approved_by     UUID        REFERENCES team_members(id),
  created_by           UUID        REFERENCES team_members(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_start  ON campaigns(start_date);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "campaigns_all" ON campaigns;
CREATE POLICY "campaigns_all" ON campaigns
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ── campaign_accounts ─────────────────────────────────────────────────────────
-- Join: which accounts participate in a campaign. Each beat fans out to every
-- participating account by default.

CREATE TABLE IF NOT EXISTS campaign_accounts (
  campaign_id       UUID NOT NULL REFERENCES campaigns(id)       ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, social_account_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_accounts_campaign ON campaign_accounts(campaign_id);

ALTER TABLE campaign_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "campaign_accounts_all" ON campaign_accounts;
CREATE POLICY "campaign_accounts_all" ON campaign_accounts
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ── campaign_beats ────────────────────────────────────────────────────────────
-- Ordered core ideas. A beat is the platform-agnostic message; its variants live
-- in content_items. status is a light roll-up — authoritative state is on variants.

CREATE TABLE IF NOT EXISTS campaign_beats (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  sequence      INT         NOT NULL,
  title         TEXT,
  core_message  TEXT        NOT NULL,
  rationale     TEXT,
  prefer_thread BOOLEAN     NOT NULL DEFAULT false,
  status        TEXT        NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned', 'generating', 'variants_ready', 'complete')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER campaign_beats_updated_at
  BEFORE UPDATE ON campaign_beats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_campaign_beats_campaign ON campaign_beats(campaign_id);

ALTER TABLE campaign_beats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "campaign_beats_all" ON campaign_beats;
CREATE POLICY "campaign_beats_all" ON campaign_beats
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ── compliance_snippets ───────────────────────────────────────────────────────
-- Keyed, versioned, reusable disclaimers. Lex selects one by key. Shared across
-- Social / Contracts / Compliance. Created before the content_items ALTER below
-- because content_items.disclaimer_snippet_id FKs it.

CREATE TABLE IF NOT EXISTS compliance_snippets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT        NOT NULL UNIQUE,
  label       TEXT,
  body        TEXT        NOT NULL,
  version     TEXT        NOT NULL DEFAULT '1.0',
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  applies_to  TEXT[]      NOT NULL DEFAULT '{}',
  created_by  UUID        REFERENCES team_members(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER compliance_snippets_updated_at
  BEFORE UPDATE ON compliance_snippets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE compliance_snippets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "compliance_snippets_all" ON compliance_snippets;
CREATE POLICY "compliance_snippets_all" ON compliance_snippets
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ── platform_specs ────────────────────────────────────────────────────────────
-- Editable per-platform limits: a platform changing its limits is a row edit, not
-- a code change. Conformance is enforced in the app (at generation and at save),
-- not by a DB constraint.

CREATE TABLE IF NOT EXISTS platform_specs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform            TEXT        NOT NULL UNIQUE
                        CHECK (platform IN ('linkedin', 'twitter_x')),
  max_chars           INT         NOT NULL,
  premium_max_chars   INT,
  max_thread_segments INT,
  max_images_per_post INT,
  image_specs         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  hashtag_guidance    TEXT,
  notes               TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER platform_specs_updated_at
  BEFORE UPDATE ON platform_specs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE platform_specs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_specs_all" ON platform_specs;
CREATE POLICY "platform_specs_all" ON platform_specs
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ── content_items (extended) ──────────────────────────────────────────────────
-- The existing content_items table is REUSED as the variant. Existing columns are
-- untouched; these add the campaign/beat/account links and thread + compliance +
-- approval state. New columns are nullable (or default false) so existing
-- non-campaign rows are unaffected.

ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS campaign_id               UUID    REFERENCES campaigns(id)            ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS beat_id                   UUID    REFERENCES campaign_beats(id)       ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS social_account_id         UUID    REFERENCES social_accounts(id)      ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_thread                 BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS char_count                INT,
  ADD COLUMN IF NOT EXISTS compliance_status         TEXT
    CHECK (compliance_status IN ('pending', 'cleared', 'flagged', 'overridden')),
  ADD COLUMN IF NOT EXISTS compliance_classification TEXT
    CHECK (compliance_classification IN ('educational', 'general_advice', 'personal_opinion')),
  ADD COLUMN IF NOT EXISTS needs_disclaimer          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS disclaimer_snippet_id     UUID    REFERENCES compliance_snippets(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS compliance_rationale      TEXT,
  ADD COLUMN IF NOT EXISTS compliance_checked_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS compliance_overridden_by  UUID    REFERENCES team_members(id),
  ADD COLUMN IF NOT EXISTS approved_by               UUID    REFERENCES team_members(id),
  ADD COLUMN IF NOT EXISTS approved_at               TIMESTAMPTZ;

-- Extend the source CHECK to include the campaign agents. Preserves the existing
-- values (incl. 'archivist_agent', present in the live constraint) and adds
-- 'margot' (strategy) and 'charlie' (variant copy).
ALTER TABLE content_items
  DROP CONSTRAINT IF EXISTS content_items_source_check;
ALTER TABLE content_items
  ADD CONSTRAINT content_items_source_check
  CHECK (source IN (
    'manual', 'coordinator_agent', 'content_agent', 'archivist_agent',
    'margot', 'charlie'));

CREATE INDEX IF NOT EXISTS idx_content_items_campaign   ON content_items(campaign_id);
CREATE INDEX IF NOT EXISTS idx_content_items_beat       ON content_items(beat_id);
CREATE INDEX IF NOT EXISTS idx_content_items_account    ON content_items(social_account_id);
CREATE INDEX IF NOT EXISTS idx_content_items_compliance ON content_items(compliance_status);

-- ── thread_segments ───────────────────────────────────────────────────────────
-- Ordered child rows of a threaded content_item. First-class so threads can be
-- reordered, edited per segment, and embedded on publish.

CREATE TABLE IF NOT EXISTS thread_segments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID        NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  sequence        INT         NOT NULL,
  body            TEXT        NOT NULL,
  char_count      INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_item_id, sequence)
);

CREATE OR REPLACE TRIGGER thread_segments_updated_at
  BEFORE UPDATE ON thread_segments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_thread_segments_item ON thread_segments(content_item_id);

ALTER TABLE thread_segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "thread_segments_all" ON thread_segments;
CREATE POLICY "thread_segments_all" ON thread_segments
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ── content_images ────────────────────────────────────────────────────────────
-- Images at the variant level, and (for threads) optionally at the segment level.
-- thread_segment_id NULL = applies to the post. Bytes live in the private Supabase
-- bucket (via packages/storage); this row holds the path + alt text + crop.

CREATE TABLE IF NOT EXISTS content_images (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id   UUID        NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  thread_segment_id UUID        REFERENCES thread_segments(id) ON DELETE CASCADE,  -- NULL = applies to the post
  storage_path      TEXT        NOT NULL,
  alt_text          TEXT,
  platform_crop     TEXT,
  sort_order        INT         NOT NULL DEFAULT 0,
  source            TEXT        NOT NULL DEFAULT 'upload'
                      CHECK (source IN ('upload', 'ai_generated')),
  created_by        UUID        REFERENCES team_members(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_images_item    ON content_images(content_item_id);
CREATE INDEX IF NOT EXISTS idx_content_images_segment ON content_images(thread_segment_id);

ALTER TABLE content_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "content_images_all" ON content_images;
CREATE POLICY "content_images_all" ON content_images
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ── post_metrics ──────────────────────────────────────────────────────────────
-- Manual, post-hoc performance numbers. One row per published variant (UNIQUE),
-- updated in place — no snapshots. Common columns + a platform-flexible JSONB.

CREATE TABLE IF NOT EXISTS post_metrics (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID        NOT NULL UNIQUE REFERENCES content_items(id) ON DELETE CASCADE,
  platform        TEXT,
  impressions     INT,
  reactions       INT,
  comments        INT,
  reposts         INT,
  clicks          INT,
  extra           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by     UUID        REFERENCES team_members(id)
);

CREATE INDEX IF NOT EXISTS idx_post_metrics_item ON post_metrics(content_item_id);

ALTER TABLE post_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "post_metrics_all" ON post_metrics;
CREATE POLICY "post_metrics_all" ON post_metrics
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ── Views ─────────────────────────────────────────────────────────────────────

-- Progress + timeline per campaign. Powers the campaigns list and Simon's status.
CREATE OR REPLACE VIEW v_campaign_overview AS
  SELECT
    c.id,
    c.name,
    c.objective,
    c.status,
    c.start_date,
    c.duration_weeks,
    (c.start_date + (c.duration_weeks * 7))                AS end_date,
    ((c.start_date + (c.duration_weeks * 7)) - CURRENT_DATE) AS days_remaining,
    COUNT(ci.id)                                           AS total_variants,
    COUNT(ci.id) FILTER (WHERE ci.status = 'published')    AS published_count,
    COUNT(ci.id) FILTER (WHERE ci.status = 'approved')     AS approved_count,
    COUNT(ci.id) FILTER (WHERE ci.status IN ('draft', 'review')) AS pending_count,
    COUNT(ci.id) FILTER (WHERE ci.compliance_status = 'flagged') AS flagged_count
  FROM campaigns c
  LEFT JOIN content_items ci ON ci.campaign_id = c.id
  GROUP BY c.id
  ORDER BY c.start_date DESC;

-- The matrix: every variant with its beat, account, platform, status, compliance.
-- Feeds the desktop calendar/grid and the mobile agenda list.
CREATE OR REPLACE VIEW v_campaign_matrix AS
  SELECT
    ci.id,
    ci.campaign_id,
    ci.beat_id,
    cb.sequence     AS beat_sequence,
    cb.title        AS beat_title,
    sa.id           AS account_id,
    sa.display_name AS account_name,
    sa.platform,
    ci.type,
    ci.is_thread,
    ci.status,
    ci.scheduled_for,
    ci.compliance_status,
    ci.compliance_classification,
    ci.needs_disclaimer,
    ci.char_count
  FROM content_items ci
  JOIN campaign_beats cb  ON cb.id = ci.beat_id
  JOIN social_accounts sa ON sa.id = ci.social_account_id
  WHERE ci.campaign_id IS NOT NULL
  ORDER BY cb.sequence ASC, sa.display_name ASC;

-- Phase 1's payoff: approved, scheduled variants ready to copy out and post.
CREATE OR REPLACE VIEW v_ready_to_post AS
  SELECT
    ci.id,
    ci.campaign_id,
    ci.title,
    ci.body,
    ci.type,
    ci.is_thread,
    ci.scheduled_for,
    sa.display_name AS account_name,
    sa.platform,
    sa.profile_url,
    cs.body         AS disclaimer_text
  FROM content_items ci
  JOIN social_accounts sa        ON sa.id = ci.social_account_id
  LEFT JOIN compliance_snippets cs ON cs.id = ci.disclaimer_snippet_id
  WHERE ci.status = 'approved'
    AND ci.campaign_id IS NOT NULL
  ORDER BY ci.scheduled_for ASC NULLS LAST;

-- ── Seed: platform_specs ──────────────────────────────────────────────────────
-- Editable config rows — sensible Phase 1 defaults; founders adjust in the UI as
-- platform limits change. X writes to the safe 280 unless an account is premium
-- (premium_max_chars). Idempotent on the UNIQUE platform key.

INSERT INTO platform_specs (platform, max_chars, premium_max_chars, max_thread_segments, max_images_per_post, image_specs, hashtag_guidance, notes)
VALUES
  ('twitter_x', 280, 25000, 25, 4,
   '{"post": {"ratio": "16:9", "recommended": "1600x900"}}'::jsonb,
   'Use 1–2 targeted hashtags at most; let the copy carry the post.',
   'Safe limit 280. Premium long-form (premium_max_chars) only for verified accounts; Phase 1 writes to 280 unless an account is flagged premium.'),
  ('linkedin', 3000, NULL, NULL, 9,
   '{"post": {"ratio": "1.91:1", "recommended": "1200x627"}}'::jsonb,
   'Hashtags optional; 3–5 relevant tags at the end is the LinkedIn norm.',
   'Single posts only in Phase 1 (LinkedIn has no native thread structure).')
ON CONFLICT (platform) DO NOTHING;

-- ── Seed: compliance_snippets ─────────────────────────────────────────────────
-- The disclaimers Lex selects from. AU general-advice framing, plain and on-voice
-- (no hype, no exclamation). Idempotent on the UNIQUE key.

INSERT INTO compliance_snippets (key, label, body, applies_to)
VALUES
  ('general_advice_warning', 'General advice warning',
   'This is general information only and does not take into account your objectives, financial situation, or needs. It is not personal financial advice. Consider seeking independent professional advice before acting.',
   '{social,contract,compliance}'),
  ('no_personal_advice', 'No personal advice',
   'Nothing here is personal financial, investment, tax, or legal advice. Bitcoin Treasury Solutions provides education and implementation support, not personal advice.',
   '{social,contract,compliance}')
ON CONFLICT (key) DO NOTHING;
