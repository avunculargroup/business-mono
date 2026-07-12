-- ============================================================
-- content_items.post_form — the editor-chosen form of a daily social post
-- ============================================================
-- The social_post_from_news routine (docs/daily-social-posts.md) has the editor
-- pick a post "form" (share_with_context, teach, flat_observation, …). Persisting
-- it on the content_item lets the next day's run read an account's recent forms
-- and bias the editor toward variety, so the feed does not settle into one shape.
--
-- Nullable and untyped (plain TEXT, not an enum): the form vocabulary lives in
-- application code (apps/agents/src/workflows/socialPost/forms.ts) and is expected
-- to grow; the reader tolerates unknown/null values. Existing non-social
-- content_items are unaffected.
-- ============================================================

ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS post_form TEXT;
