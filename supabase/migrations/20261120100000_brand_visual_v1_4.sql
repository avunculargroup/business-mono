-- ============================================================
-- brand_visual canon v1.4 — headline cards: square art beside a headline
-- ============================================================
-- Spec: docs/features/social-post-image/feature-spec.md → Headline cards
--
-- The images printed well under v1.3, but most ideas were riddles: abstract
-- finance (buybacks, index exclusion, a split RBA vote) cannot be drawn
-- literally under our rules, so the brief fell back on allegory a feed has no
-- time to decode. The fix magazines use: a short headline beside the picture.
-- The picture sets the mood; three to six words carry the meaning. The
-- headline is set in real type by code (apps/agents headlineCard.ts), never
-- drawn by the model, so the no-text rule for the model stands. Decided by
-- Chris 2026-11-20: headline cards are the default.
--
--   * card (JSONB, additive): the headline card settings, tunable from /brand
--     without a deploy. Read through toBrandVisual with tolerant defaults, so
--     the default here and DEFAULT_CARD_SETTINGS in @platform/shared agree.
--   * headline_composition_block (TEXT, additive): one paragraph that
--     buildImagePrompt sends only for a headline card's square art, after the
--     composition block. Empty means "omit it".
--   * v1.4 itself: the paragraph's text and the version bump, in place, as
--     every canon migration has done. No other canon change: style, palette
--     and prohibitions are untouched.
--
-- Guarded to run once and never over a founder's edits: the update only
-- touches a canon still on v1.3. Any save from /brand bumps the version, so an
-- edited canon is left alone; paste the paragraph into Brand → Visual →
-- Headline cards instead (the PR description carries the text). The two new
-- columns are added either way: an empty paragraph only means the square-art
-- prompt goes without it.
-- ============================================================

ALTER TABLE brand_visual
  ADD COLUMN IF NOT EXISTS card JSONB NOT NULL DEFAULT
    '{"enabled": true, "headline_size_max": 64, "headline_size_min": 44, "max_lines": 4, "kicker": true}'::jsonb,
  ADD COLUMN IF NOT EXISTS headline_composition_block TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN brand_visual.card IS
  'Headline card settings (canon v1.4): { enabled, headline_size_max, headline_size_min, max_lines, kicker }. Sizes are for the 627px LinkedIn card; X scales them.';
COMMENT ON COLUMN brand_visual.headline_composition_block IS
  'Sent to the image model only for a headline card''s square art, after composition_block. Empty: omitted.';

UPDATE brand_visual
SET
  version = '1.4',
  headline_composition_block = $canon$This picture sits beside a headline. Its job is mood and recognition, not
explanation: one strong, simple, everyday object or scene, big and instantly
recognisable. Keep the left edge (roughly the leftmost 8 percent) and the
bottom-right corner as empty paper.$canon$,
  notes = 'Canon v1.4 (2026-11-20): headline cards. Square art beside a headline set by code; the composition paragraph for square art and the card settings. See docs/features/social-post-image/feature-spec.md.'
WHERE is_active = true
  AND version = '1.3';
