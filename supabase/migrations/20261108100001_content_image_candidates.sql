-- ============================================================
-- content_images — candidates: three images per run, one selected
-- ============================================================
-- Spec: docs/features/social-post-image/feature-spec.md → candidates
--
-- Each run (and each regenerate) renders up to three concepts. Every rendered
-- concept is its own generation group, as before; the groups of one run share
-- candidate_set_id. Exactly one group per set is selected, and the selection is
-- per run, not per platform: LinkedIn and X always show the same image.
-- Everything that consumes an image (the draft page, copy-out, the email, any
-- posting path) reads is_selected = true only.
--
-- Unpicked candidates are kept and marked review_outcome = 'not_chosen' when a
-- founder picks another: that is the signal a later feedback step learns from.
--
-- Additive. The default backfills every existing row as selected, which is
-- right: before this, each draft had one image and it was the one shown.
-- ============================================================

ALTER TABLE content_images
  ADD COLUMN IF NOT EXISTS candidate_set_id UUID,
  ADD COLUMN IF NOT EXISTS candidate_index  SMALLINT,
  ADD COLUMN IF NOT EXISTS is_selected      BOOLEAN NOT NULL DEFAULT true;

-- review_outcome's CHECK was declared inline in 20261108000001, so Postgres
-- named it content_images_review_outcome_check.
ALTER TABLE content_images DROP CONSTRAINT IF EXISTS content_images_review_outcome_check;
ALTER TABLE content_images ADD CONSTRAINT content_images_review_outcome_check
  CHECK (review_outcome IN ('kept', 'regenerated', 'removed', 'not_chosen'));

CREATE INDEX IF NOT EXISTS idx_content_images_candidate_set
  ON content_images(candidate_set_id)
  WHERE candidate_set_id IS NOT NULL;
