-- ============================================================
-- content_images — provenance columns for AI-generated social images
-- ============================================================
-- Spec: docs/features/social-post-image/feature-spec.md → Data model
--
-- Additive and all nullable, so manual uploads are unaffected. Every row from
-- one render (the LinkedIn crop and the X crop) shares generation_group_id, so
-- regenerate and remove act on the group. The brief, the exact prompt sent,
-- the canon version, model and cost are stored per row: any image can be
-- explained later without re-deriving anything.
-- ============================================================

ALTER TABLE content_images
  ADD COLUMN IF NOT EXISTS generation_group_id  UUID,
  ADD COLUMN IF NOT EXISTS image_brief          JSONB,
  ADD COLUMN IF NOT EXISTS assembled_prompt     TEXT,
  ADD COLUMN IF NOT EXISTS brand_visual_version TEXT,
  ADD COLUMN IF NOT EXISTS model_id             TEXT,
  ADD COLUMN IF NOT EXISTS generation_ref       TEXT,
  ADD COLUMN IF NOT EXISTS cost_usd             NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS is_style_anchor      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_outcome       TEXT
    CHECK (review_outcome IN ('kept', 'regenerated', 'removed')),
  ADD COLUMN IF NOT EXISTS alt_text_verdict     JSONB;

CREATE INDEX IF NOT EXISTS idx_content_images_generation_group
  ON content_images(generation_group_id)
  WHERE generation_group_id IS NOT NULL;
