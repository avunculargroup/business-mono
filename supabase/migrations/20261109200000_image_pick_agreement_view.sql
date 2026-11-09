-- ============================================================
-- v_image_pick_agreement — does the founder pick what the reviewer ranked first?
-- ============================================================
-- Spec: docs/features/social-post-image/feature-spec.md → "Reviewer agreement"
--
-- The image reviewer ranks every candidate it scored (image_brief.review.rank,
-- 1 = its top pick). The founder's pick is recorded by the web's "Use this
-- image" (review_outcome 'kept' + is_selected on the chosen group, 'not_chosen'
-- on the rest). Nothing showed how often the two agree, or what the founder
-- picks instead. This view is that evidence, read by the /brand Visual tab. It
-- changes nothing: re-weighting the reviewer is a later decision.
--
-- One row per decided candidate set. A set is decided when one of its groups
-- is selected and marked 'kept': a founder chose it ("Use this image"), or kept
-- the selected image by editing its alt text. Untouched sets carry the default
-- selection with a NULL outcome and are excluded: a default is not a pick. A
-- set only regenerated or removed has no pick and is excluded too.
--
-- A set holds one row per draft (LinkedIn crop, X crop) per group; the rows of
-- a group share their brief, outcome and selection, so the view reads one row
-- per generation_group_id.
--
-- Rows rendered on a review fallback, and a founder's own Edit brief render,
-- carry review: null. Their rank and scores read NULL, and agreed is NULL
-- rather than false: there was no reviewer verdict to agree with.
--
-- security_invoker: content_images' RLS (is_team_member()) applies to whoever
-- reads the view, so it is team-only like the table.
-- ============================================================

CREATE VIEW v_image_pick_agreement WITH (security_invoker = true) AS
WITH groups AS (
  SELECT DISTINCT ON (ci.generation_group_id)
    ci.candidate_set_id,
    ci.generation_group_id,
    ci.is_selected,
    ci.review_outcome,
    ci.created_at,
    ci.image_brief->>'symbol' AS symbol,
    ci.image_brief->>'layout' AS layout,
    (ci.image_brief->'review'->>'rank')::numeric::int AS rank,
    (ci.image_brief->'review'->>'recognisable')::numeric AS recognisable,
    (ci.image_brief->'review'->>'twist_visible')::numeric AS twist_visible,
    (ci.image_brief->'review'->>'on_hook')::numeric AS on_hook
  FROM content_images ci
  WHERE ci.source = 'ai_generated'
    AND ci.candidate_set_id IS NOT NULL
    AND ci.generation_group_id IS NOT NULL
  ORDER BY ci.generation_group_id, ci.created_at
),
sets AS (
  SELECT candidate_set_id, min(created_at) AS created_at
  FROM groups
  GROUP BY candidate_set_id
),
picked AS (
  SELECT DISTINCT ON (candidate_set_id) *
  FROM groups
  WHERE is_selected AND review_outcome = 'kept'
  ORDER BY candidate_set_id, created_at DESC
),
top_pick AS (
  SELECT DISTINCT ON (candidate_set_id) *
  FROM groups
  WHERE rank = 1
  ORDER BY candidate_set_id, created_at
)
SELECT
  s.candidate_set_id,
  s.created_at,
  p.generation_group_id AS picked_group,
  p.rank AS picked_rank,
  p.symbol AS picked_symbol,
  p.layout AS picked_layout,
  p.recognisable AS picked_recognisable,
  p.twist_visible AS picked_twist_visible,
  p.on_hook AS picked_on_hook,
  t.generation_group_id AS top_group,
  t.symbol AS top_symbol,
  t.recognisable AS top_recognisable,
  t.twist_visible AS top_twist_visible,
  t.on_hook AS top_on_hook,
  CASE
    WHEN p.rank IS NULL OR t.generation_group_id IS NULL THEN NULL
    ELSE p.generation_group_id = t.generation_group_id
  END AS agreed
FROM sets s
JOIN picked p ON p.candidate_set_id = s.candidate_set_id
LEFT JOIN top_pick t ON t.candidate_set_id = s.candidate_set_id;

COMMENT ON VIEW v_image_pick_agreement IS
  'One row per decided image candidate set: the founder''s pick against the reviewer''s rank-1 candidate. agreed is NULL when either has no reviewer verdict.';
