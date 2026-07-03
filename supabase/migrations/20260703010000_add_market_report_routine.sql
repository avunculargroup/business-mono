-- ── Extend routines.action_type to include market_report, + seed the routine ────
-- The daily market snapshot email. Simon reads the already-stored on-chain
-- (v_onchain_dashboard) and macro (v_indicator_latest) views and emails the team a
-- neutral daily report. Deterministic, read-only. See
-- apps/agents/src/lib/report/runMarketReport.ts.

ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_action_type_check;
ALTER TABLE routines
  ADD CONSTRAINT routines_action_type_check
  CHECK (action_type IN ('research_digest', 'monitor_change', 'news_ingest',
                         'news_source_scan', 'newsletter', 'podcast_ingest',
                         'news_curation', 'indicator_poll', 'onchain_poll',
                         'social_post_from_news', 'market_report'));

-- One daily report at 09:00 AEST — after the 08:00 on-chain and macro polls, so it
-- reads the day's fresh observations. Idempotent on name + action_type.
INSERT INTO routines (
  name, description, agent_name, action_type, action_config,
  frequency, time_of_day, timezone, next_run_at,
  show_on_dashboard, is_active
)
SELECT
  'Daily market report',
  'Reads the stored on-chain (v_onchain_dashboard) and macro (v_indicator_latest) indicators and emails the team a neutral daily snapshot — current values, day-over-day/period change, and the hash-ribbon signal. Deterministic; runs after the 08:00 polls.',
  'simon', 'market_report',
  '{}'::jsonb,
  'daily', '09:00', 'Australia/Melbourne',
  NOW(),
  FALSE, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM routines r
  WHERE r.name = 'Daily market report' AND r.action_type = 'market_report'
);
