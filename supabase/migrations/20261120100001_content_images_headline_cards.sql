-- ============================================================
-- content_images — headline cards; content_image_requests — recompose
-- ============================================================
-- Spec: docs/features/social-post-image/feature-spec.md → Headline cards
--
-- From 2026-11-20 a run's image is by default a headline card: square art
-- flush right, a headline set in real type beside it, a kicker above. Each
-- platform card is composed by code from one unmarked master, which is now
-- kept so the words can change without a new render.
--
-- content_images (additive; old rows stay NULL, which reads as image-only):
--   card_type         'headline' or 'image_only'
--   headline          the headline printed on the card, typographic quotes
--   kicker            the label above it (REGULATION, TREASURY, ...), or NULL
--   headline_verdict  Lex's advisory verdict on the headline, the same shape
--                     as alt_text_verdict; NULL when there is no headline
--   master_path       the unmarked art the cards were composed from: square
--                     (master-1x1.png) for a headline card's render, 16:9
--                     (master-16x9.png) for an image-only render. Added beyond
--                     the spec's four columns: an image-only card can be made
--                     from either, so the file name cannot be derived from
--                     card_type, and recompose and promote-to-anchor both need
--                     it. NULL on older rows: their master is master-16x9.png
--                     beside the cards.
--
-- content_image_requests:
--   action 'recompose'  rebuild the selected group's cards from the stored
--                       master with a founder's headline and kicker (or none).
--                       No model call; Lex re-checks the headline.
--   card JSONB          the recompose payload:
--                       { generation_group_id, show_headline, headline, kicker }
-- ============================================================

ALTER TABLE content_images
  ADD COLUMN IF NOT EXISTS card_type        TEXT CHECK (card_type IN ('headline', 'image_only')),
  ADD COLUMN IF NOT EXISTS headline         TEXT,
  ADD COLUMN IF NOT EXISTS kicker           TEXT,
  ADD COLUMN IF NOT EXISTS headline_verdict JSONB,
  ADD COLUMN IF NOT EXISTS master_path      TEXT;

-- action's CHECK was declared inline in 20261108000002, so Postgres named it
-- content_image_requests_action_check.
ALTER TABLE content_image_requests DROP CONSTRAINT IF EXISTS content_image_requests_action_check;
ALTER TABLE content_image_requests ADD CONSTRAINT content_image_requests_action_check
  CHECK (action IN ('regenerate', 'render_brief', 'recheck_alt_text', 'recompose'));

ALTER TABLE content_image_requests
  ADD COLUMN IF NOT EXISTS card JSONB;

ALTER TABLE content_image_requests DROP CONSTRAINT IF EXISTS content_image_requests_card_present;
ALTER TABLE content_image_requests ADD CONSTRAINT content_image_requests_card_present
  CHECK (action <> 'recompose' OR card IS NOT NULL);
