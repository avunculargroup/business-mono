-- ── Extend routines.action_type constraint to include news_curation ──────────

ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_action_type_check;
ALTER TABLE routines
  ADD CONSTRAINT routines_action_type_check
  CHECK (action_type IN ('research_digest', 'monitor_change', 'news_ingest',
                         'news_source_scan', 'newsletter', 'podcast_ingest',
                         'news_curation'));

-- ── Seed: one daily news-curation routine ─────────────────────────────────────
-- Runs after the morning ingest routines (source scan 06:30, news_ingest 07:00)
-- and curates the best news_items + podcast_episodes into a dashboard tile.
-- agent_name 'charlie' (writes the mood summary); the editor agent (internal-only,
-- not in the agent_name CHECK) does the selection. Idempotent on name + action_type.

INSERT INTO routines (
  name, description, agent_name, action_type, action_config,
  frequency, time_of_day, timezone, next_run_at,
  show_on_dashboard, dashboard_title, is_active
)
SELECT
  'Daily news curation',
  'Curates the day''s best stories across all news sources and podcasts into a dashboard tile — a one-sentence mood summary, up to six ranked stories, a headline image, and a link to the full news feed.',
  'charlie', 'news_curation',
  '{"max_stories": 6, "lookback_hours": 24, "more_news_url": "/news"}'::jsonb,
  'daily', '08:00', 'Australia/Melbourne',
  NOW(),
  TRUE, 'Today in Bitcoin', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM routines r
  WHERE r.name = 'Daily news curation' AND r.action_type = 'news_curation'
);
