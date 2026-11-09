-- ============================================================
-- brand_visual canon v1.3 — a flat print, not a photograph of one
-- ============================================================
-- Spec: docs/features/social-post-image/feature-spec.md → canon v1.3
--
-- On the 2026-11-09 CP 392 run the railway signal gantry came back as a
-- photograph of a linocut lying on a wooden table: paper edge, wood in the
-- top-left corner, perspective, shadow. An earlier football pitch had the same
-- fault. The style block's "the slightly uneven ink texture of a hand-pulled
-- print" reads as "show me a print", and the prohibited block's "Photographs"
-- was not connected to it. v1.3:
--
--   * style: the opening sentence now says the image is a flat, straight-on
--     scan of the printed sheet filling the whole frame; "a hand-pulled print"
--     becomes "hand printing". The rest is unchanged.
--   * prohibited block: one line appended naming the photographed-print look.
--
-- The agents' corner check (imageCompose.ts) rejects any render that still
-- shows a table or shadow in a corner; this wording is the first line of
-- defence, that check the second.
--
-- Versioning matches the /brand Visual tab's save action and the earlier canon
-- migrations: the active row is updated in place and its version bumped.
--
-- Guarded to run once, and never over a founder's edits: it only rewrites a
-- canon still on v1.2 with v1.2's style block. Any save from /brand bumps the
-- version, so an edited canon is left alone; make the same edit there instead.
-- ============================================================

UPDATE brand_visual
SET
  version = '1.3',
  style_block = $canon$A bold two-colour linocut print, shown as a flat, straight-on scan of the printed
sheet that fills the whole frame: black ink and one flat gold on bright off-white
paper. Strong, simple shapes cut with confidence: solid black masses, crisp white
gouge lines carved through them, visible carving marks, and the slightly uneven
ink texture of hand printing. Gold is a second printed colour laid down in large
flat shapes, not a thin accent. One iconic subject, big and instantly
recognisable, with a silhouette that still reads at thumbnail size. Graphic,
confident and striking, like a classic travel poster or a woodcut book cover.$canon$,
  prohibited_block = prohibited_block || E'\n' || $canon$A photograph of a print: no table, desk or background surface, no visible paper
edges or corners, no perspective or tilt, no shadows or lighting on the paper.$canon$,
  notes = 'Canon v1.3 (2026-11-09): the style says "a flat, straight-on scan of the printed sheet" and the prohibited block names the photographed-print look, after a render came back as a linocut photographed on a wooden table. See docs/features/social-post-image/feature-spec.md.'
WHERE is_active = true
  AND version = '1.2'
  AND style_block LIKE 'A bold two-colour linocut%';
