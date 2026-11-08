-- ============================================================
-- platform_capabilities — social post images
-- ============================================================
-- Registers the image step of social_post_from_news so Simon's capacity check
-- knows it exists (CLAUDE.md: update platform_capabilities when adding one).
-- Charlie owns it: the brief is a Charlie step, and the activity rows log as
-- 'charlie'. Lex's alt-text check is part of content_compliance_review.
-- No unique key on (agent_name, capability), so the insert guards itself.
-- Spec: docs/features/social-post-image/feature-spec.md
-- ============================================================

INSERT INTO platform_capabilities (agent_name, capability, status, phase, tools_required, notes)
SELECT
  'charlie',
  'social_post_images',
  'active',
  'phase_1',
  ARRAY['openrouter_image_api'],
  'One on-brand illustration per daily social_post_from_news run, shared by the LinkedIn and X drafts: a structured brief linted against the brand_visual canon, a deterministic prompt, an OpenRouter render, a crop per platform with the BTS mark composited by code. Best-effort, never blocks the drafts. Founders regenerate, re-brief or remove it from /content/[id].'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_capabilities WHERE agent_name = 'charlie' AND capability = 'social_post_images'
);
