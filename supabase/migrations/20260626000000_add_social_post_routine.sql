-- ── Extend routines.action_type to include social_post_from_news, + seed ──────
-- One routine per founder. Each run lets the editor pick the day's news story
-- that best fits THAT founder's voice and the post form (share-with-context vs
-- teach), Charlie drafts a LinkedIn + an X post in the founder's voice, Lex
-- classifies advice risk, both land in content_items as drafts, and the founder
-- is emailed the drafts with a CTA to review on the web app.
-- Handler: apps/agents/src/workflows/socialPost/. agent_name 'charlie' (the
-- drafting agent); the editor agent (internal-only, not in the agent_name CHECK)
-- does story + form selection.

ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_action_type_check;
ALTER TABLE routines
  ADD CONSTRAINT routines_action_type_check
  CHECK (action_type IN ('research_digest', 'monitor_change', 'news_ingest',
                         'news_source_scan', 'newsletter', 'podcast_ingest',
                         'news_curation', 'indicator_poll', 'onchain_poll',
                         'social_post_from_news'));

-- ── Seed: one daily routine per founder ───────────────────────────────────────
-- Runs at 09:00 AEST, after the morning news pipeline (source scan 06:30,
-- news_ingest 07:00, curation 08:00) so the candidate pool is fresh. A founder
-- here is any team_member who owns a founder social_account. Idempotent per
-- founder: keyed on action_type + the founder_team_member_id in action_config,
-- so re-running never duplicates and adding a third founder later seeds them too.

INSERT INTO routines (
  name, description, agent_name, action_type, action_config,
  frequency, time_of_day, timezone, next_run_at,
  show_on_dashboard, dashboard_title, is_active
)
SELECT
  'Social posts — ' || tm.full_name,
  'Drafts a LinkedIn and an X post for ' || tm.full_name ||
    ' from the day''s news. The editor picks the story that best fits their voice and the post form; the drafts land in the content pipeline and ' ||
    tm.full_name || ' is emailed to review.',
  'charlie', 'social_post_from_news',
  jsonb_build_object(
    'founder_team_member_id', tm.id,
    'platforms', '["linkedin","twitter_x"]'::jsonb,
    'lookback_hours', 24
  ),
  'daily', '09:00', 'Australia/Melbourne',
  NOW(),
  TRUE, 'Social drafts — ' || tm.full_name, TRUE
FROM team_members tm
WHERE EXISTS (
  SELECT 1 FROM social_accounts sa
  WHERE sa.team_member_id = tm.id AND sa.account_type = 'founder'
)
AND NOT EXISTS (
  SELECT 1 FROM routines r
  WHERE r.action_type = 'social_post_from_news'
    AND r.action_config->>'founder_team_member_id' = tm.id::text
);
