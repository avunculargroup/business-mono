-- ── Extend routines.action_type to include report_watch_scan, + seed the routine ──
-- The daily report sweep: discover candidates on every active report_watch
-- source, acquire what's new, extract, index, and hand off to the existing
-- news_items feed. See apps/agents/src/lib/reportWatch/index.ts.
--
-- Scheduling rides the routines table rather than the Mastra-native schedule
-- ecosystemScanWorkflow uses. Ecosystem needed that bypass for hourly
-- granularity routines.frequency cannot express; report watching needs one
-- uniform daily cadence, which routines already supports.

ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_action_type_check;
ALTER TABLE routines
  ADD CONSTRAINT routines_action_type_check
  CHECK (action_type IN ('research_digest', 'monitor_change', 'news_ingest',
                         'news_source_scan', 'newsletter', 'podcast_ingest',
                         'news_curation', 'indicator_poll', 'onchain_poll',
                         'social_post_from_news', 'market_report',
                         'report_watch_scan'));

-- 07:00 AEST, ahead of Simon's 08:00 briefing so newly acquired reports and any
-- source-health alert are available to it the same morning. Idempotent on
-- name + action_type.
INSERT INTO routines (
  name, description, agent_name, action_type, action_config,
  frequency, time_of_day, timezone, next_run_at,
  show_on_dashboard, is_active
)
SELECT
  'Daily report watch',
  'Runs discovery on every active report_watch source, acquires and stores new PDF/HTML reports, extracts and indexes their text, and surfaces each one in the research feed for Rex to score.',
  'rex', 'report_watch_scan',
  '{}'::jsonb,
  'daily', '07:00', 'Australia/Melbourne',
  NOW(),
  FALSE, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM routines r
  WHERE r.name = 'Daily report watch' AND r.action_type = 'report_watch_scan'
);
