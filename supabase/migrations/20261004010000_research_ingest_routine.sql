-- ============================================================
-- CORPORATE HOLDINGS — schedule the research ingest
-- Spec: docs/features/corporate-holdings/schema-ingest-spec.md
--       → "Scheduling, once the above exists"
--
-- Extends routines.action_type with research_ingest and seeds the weekly
-- routine. Each firing runs researchIngest once per record that is not
-- retired, in sequence; every new or changed row lands as a draft stamped with
-- its run, and the team is emailed the records left something to review
-- (nothing, on a week where nothing happened).
--
-- Seeded INACTIVE. No run has yet fetched a real filing (the agents server
-- holds the model keys and SEC access), so the first run is started by hand
-- and watched, and the schedule is switched on from /routines afterwards.
-- show_on_dashboard is on; the dashboard lists active routines with a result,
-- so the card appears after the first scheduled run.
-- ============================================================

ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_action_type_check;
ALTER TABLE routines
  ADD CONSTRAINT routines_action_type_check
  CHECK (action_type IN ('research_digest', 'monitor_change', 'news_ingest',
                         'news_source_scan', 'newsletter', 'podcast_ingest',
                         'news_curation', 'indicator_poll', 'onchain_poll',
                         'social_post_from_news', 'market_report',
                         'report_watch_scan', 'research_ingest'));

-- Weekly at 06:45 Melbourne. The weekday is whichever day it is first
-- switched on, since next_run_at advances from each firing; set it in /routines
-- if a particular day matters. Idempotent on name + action_type.
INSERT INTO routines (
  name, description, agent_name, action_type, action_config,
  frequency, time_of_day, timezone, next_run_at,
  show_on_dashboard, dashboard_title, is_active
)
SELECT
  'Weekly corporate research ingest',
  'Runs the research ingest for every register record that is not retired: fetches registered filings, extracts and validates events, and leaves new or changed rows as drafts for review on /research. Emails the team when anything is waiting.',
  'rex', 'research_ingest',
  '{}'::jsonb,
  'weekly', '06:45', 'Australia/Melbourne',
  NOW(),
  TRUE, 'Corporate research review', FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM routines r
  WHERE r.name = 'Weekly corporate research ingest' AND r.action_type = 'research_ingest'
);
