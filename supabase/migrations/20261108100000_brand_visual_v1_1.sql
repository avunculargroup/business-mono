-- ============================================================
-- brand_visual canon v1.1 — the drawn/undrawn device and layout presets
-- ============================================================
-- Spec: docs/features/social-post-image/feature-spec.md → canon v1.1
--
-- v1.0's closed motif list mapped a post's topic to a stock symbol: the first
-- real post ("Twenty years ... nobody knows the trigger") came back as a pencil
-- hourglass centred in a wide frame on yellowed paper. v1.1 changes the art
-- direction rather than the model:
--
--   * style: every drawing is deliberately unfinished. What the post treats as
--     known is drawn in full; what is uncertain is left as construction lines.
--   * palette: the paper entry says bright near-white, never cream or aged.
--   * composition: follow the given layout; never centre one upright object.
--   * layouts: a new column of composition presets the brief must choose from.
--   * prohibited_terms: a stock-symbol list on top of the v1.0 terms (linter
--     only; never sent to the model).
--
-- Versioning matches the /brand Visual tab's save action
-- (apps/web/app/actions/brandVisual.ts): the single active row is updated in
-- place and its version bumped. Images already made keep the version and the
-- exact prompt they were rendered with in content_images. `motifs` is kept,
-- untouched: rows made under v1.0 reference it.
--
-- Guarded to run once: it only rewrites a canon whose layouts are still empty,
-- so a re-run never overwrites what the founders have since edited.
-- ============================================================

ALTER TABLE brand_visual
  ADD COLUMN IF NOT EXISTS layouts JSONB NOT NULL DEFAULT '[]'::jsonb;  -- [{ key, label, description, is_active }]

UPDATE brand_visual
SET
  version = CASE
    WHEN version ~ '^[0-9]+\.[0-9]+$'
      THEN split_part(version, '.', 1) || '.' || (split_part(version, '.', 2)::int + 1)::text
    ELSE '1.1'
  END,
  style_block = $canon$A hand-drawn sketch in graphite pencil and fine ink on bright, fresh cartridge
paper. Every drawing is deliberately unfinished. The part of the subject that is
known or certain is drawn in full: confident line, light cross-hatching, and the
single gold accent. The part that is uncertain, unbuilt or unknown is left as
faint construction lines only: guidelines, measured marks, an outline that stops
partway. The edge where finished drawing gives way to construction lines is the
point of the picture. It should look like an architect's working sketch, drawn by
a skilled hand to think something through, not to decorate. Considered and
quietly confident, with a clear point of view.$canon$,
  palette = (
    SELECT jsonb_agg(
      CASE WHEN p->>'role' = 'Paper'
        THEN jsonb_set(p, '{usage}', to_jsonb('Bright near-white paper. Not cream, not aged, not yellowed, not parchment. Clean and even.'::text))
        ELSE p
      END
      ORDER BY ord)
    FROM jsonb_array_elements(palette) WITH ORDINALITY AS e(p, ord)
  ),
  composition_block = $canon$Follow the layout given below exactly. Never centre a single upright object in a
wide frame. Prefer subjects with a horizontal extent that suit a landscape frame.
Keep every important element inside the central 80% of the frame. Leave the
bottom-right corner (roughly the lowest and rightmost 15% of the frame) as empty
paper.$canon$,
  prohibited_terms = (
    SELECT array_agg(DISTINCT t ORDER BY t)
    FROM unnest(prohibited_terms || ARRAY[
      'hourglass', 'clock', 'stopwatch', 'calendar', 'compass', 'chess', 'chessboard',
      'lightbulb', 'light bulb', 'puzzle', 'jigsaw', 'scales', 'balance scale', 'padlock',
      'key', 'keyhole', 'ladder', 'summit', 'mountain peak', 'crossroads', 'signpost',
      'umbrella', 'piggy bank', 'vault door', 'safe'
    ]) AS t
  ),
  layouts = '[
    {"key": "left_third", "label": "Left third", "description": "Subject sits in the left third; open paper runs to the right, so the eye travels into space.", "is_active": true},
    {"key": "low_horizon", "label": "Low horizon", "description": "One horizon line in the lower third; the subject is small on it, with wide open paper above.", "is_active": true},
    {"key": "close_detail", "label": "Close detail", "description": "A tight close-up of one part of an object, running off at least one edge of the frame.", "is_active": true},
    {"key": "small_in_space", "label": "Small in space", "description": "A small subject placed well off-centre in a large empty field.", "is_active": true}
  ]'::jsonb,
  notes = 'Canon v1.1 (2026-11-08): the drawn/undrawn device replaces the v1.0 motif list, which produced stock imagery (the first real post became a centred hourglass on yellowed paper). Layout presets, bright paper, a stock-symbol term list. See docs/features/social-post-image/feature-spec.md.'
WHERE is_active = true
  AND layouts = '[]'::jsonb;
