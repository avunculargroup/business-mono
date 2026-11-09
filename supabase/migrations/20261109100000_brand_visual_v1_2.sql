-- ============================================================
-- brand_visual canon v1.2 — linocut, iconic, built for the feed
-- ============================================================
-- Spec: docs/features/social-post-image/feature-spec.md → canon v1.2
--
-- v1.1 fixed v1.0's bland hourglass and overcorrected. Its first three images
-- for the ASIC CP 392 post ("140 businesses have applied ... Clarity's coming.
-- April 2027.") were a half-drawn bridge pier, fence posts trailing into
-- guidelines, and pipe stumps under scaffolding lines: clever concept sketches
-- that each needed a caption. In a feed nobody reads the caption. v1.2 sets the
-- bar at the half-second phone test:
--
--   * style: a bold two-colour linocut (black ink, one flat gold), one big
--     iconic subject whose silhouette reads at thumbnail size.
--   * palette: three entries (paper, ink, gold); gold is a second printed
--     colour in large shapes, not a thin accent.
--   * composition: one subject filling 60–80% of the frame height, full-bleed,
--     no borders or bars; bottom-right corner still left unprinted for the mark.
--   * prohibited block: appended with the v1.1 pencil look, photographic and
--     gradient rendering, other colours, and borders or bars.
--   * prohibited_terms: v1.1's stock-symbol list is REMOVED. Familiar symbols
--     are now wanted, with one twist. v1.0's finance clichés and anything
--     implying a price direction stay: that rule is compliance, not taste.
--   * style_anchor_paths: cleared. Anchors promoted under v1.0 or v1.1 are
--     pencil sketches and would pull renders back to the old style. Only the
--     array is cleared; the anchor objects stay in storage.
--   * layouts: v1.1's four are deactivated, not deleted (old rows reference
--     them), and four v1.2 layouts are added.
--
-- Versioning matches the /brand Visual tab's save action and v1.1's migration:
-- the single active row is updated in place and its version bumped. Images
-- already made keep the version and the exact prompt they were rendered with.
--
-- Guarded to run once, and never over a founder's edits: it only rewrites a
-- canon whose style block is still v1.1's pencil sketch.
-- ============================================================

UPDATE brand_visual
SET
  version = CASE
    WHEN version ~ '^[0-9]+\.[0-9]+$'
      THEN split_part(version, '.', 1) || '.' || (split_part(version, '.', 2)::int + 1)::text
    ELSE '1.2'
  END,
  style_block = $canon$A bold two-colour linocut print: black ink and one flat gold, printed on bright
off-white paper. Strong, simple shapes cut with confidence: solid black masses,
crisp white gouge lines carved through them, visible carving marks, and the
slightly uneven ink texture of a hand-pulled print. Gold is a second printed
colour laid down in large flat shapes, not a thin accent. One iconic subject,
big and instantly recognisable, with a silhouette that still reads at thumbnail
size. Graphic, confident and striking, like a classic travel poster or a
woodcut book cover.$canon$,
  palette = '[
    {"role": "Paper", "hex": "#FAFAF8", "usage": "Bright off-white, unprinted areas clean and even. Not cream, not aged, not yellowed."},
    {"role": "Ink", "hex": "#1A1915", "usage": "Solid black printed masses and carved line work."},
    {"role": "Gold", "hex": "#C9A84C", "usage": "A flat second printed colour in large shapes. It may cover up to a third of the image."}
  ]'::jsonb,
  composition_block = $canon$One subject, and make it big: it fills 60 to 80 percent of the frame height.
Simple and bold enough to recognise in half a second on a phone. Place it
according to the layout below, never small and never lost in empty space. Black
and gold together cover roughly a third to two thirds of the image. Print
full-bleed on the paper: no borders, frames, margins, mounts or black bars. Keep
the bottom-right corner (roughly the lowest and rightmost 15 percent of the
frame) as unprinted paper.$canon$,
  prohibited_block = prohibited_block || E'\n' || $canon$Pencil sketch, fine hatching, construction or guide lines, unfinished drawing.
Photographs, 3D, gradients, airbrushing. Any colour other than black and gold.
Borders, frames, letterboxing or bars.$canon$,
  prohibited_terms = (
    SELECT coalesce(array_agg(t ORDER BY t), '{}')
    FROM unnest(prohibited_terms) AS t
    WHERE t <> ALL (ARRAY[
      'hourglass', 'clock', 'stopwatch', 'calendar', 'compass', 'chess', 'chessboard',
      'lightbulb', 'light bulb', 'puzzle', 'jigsaw', 'scales', 'balance scale', 'padlock',
      'key', 'keyhole', 'ladder', 'summit', 'mountain peak', 'crossroads', 'signpost',
      'umbrella', 'piggy bank', 'vault door', 'safe'
    ])
  ),
  style_anchor_paths = '{}',
  layouts = (
    SELECT coalesce(jsonb_agg(jsonb_set(l, '{is_active}', 'false'::jsonb) ORDER BY ord), '[]'::jsonb)
    FROM jsonb_array_elements(layouts) WITH ORDINALITY AS e(l, ord)
  ) || '[
    {"key": "hero_left", "label": "Hero left", "description": "The subject is large and sits left of centre, filling most of the frame height; bold open space to the right.", "is_active": true},
    {"key": "close_crop", "label": "Close crop", "description": "The subject is so close that the frame edges cut it off; it fills the whole frame.", "is_active": true},
    {"key": "diagonal", "label": "Diagonal", "description": "The subject runs on a strong diagonal from lower left to upper right, top to bottom of the frame.", "is_active": true},
    {"key": "against_gold", "label": "Against gold", "description": "A large black silhouette set against one big flat gold shape behind it, such as a disc, a band or a field.", "is_active": true}
  ]'::jsonb,
  notes = 'Canon v1.2 (2026-11-09): a bold two-colour linocut of a familiar symbol with one twist, built for the half-second phone test. v1.1''s drawn/undrawn pencil device and its stock-symbol ban are retired: its images were clever but unreadable at phone size. Anchors cleared (they were pencil sketches). See docs/features/social-post-image/feature-spec.md.'
WHERE is_active = true
  AND style_block LIKE 'A hand-drawn sketch%';
