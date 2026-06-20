-- ── Extend routines.action_type to include indicator_poll, + seed the routine ──
-- Session 2 of the Economic Indicators feature: the scheduled macro poll.
-- Simon polls each due economic_indicator via its provider adapter (FRED/RBA),
-- upserts observations with revision handling, and proposes a content beat on a
-- qualifying new print. See docs/features/economic-indicators/.

ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_action_type_check;
ALTER TABLE routines
  ADD CONSTRAINT routines_action_type_check
  CHECK (action_type IN ('research_digest', 'monitor_change', 'news_ingest',
                         'news_source_scan', 'newsletter', 'podcast_ingest',
                         'news_curation', 'indicator_poll'));

-- One daily indicator poll at 08:00 AEST. The routine runs daily; each indicator
-- is gated to its own poll_frequency inside runIndicatorPoll (weekly indicators
-- only hit their API on Mondays). Idempotent on name + action_type.
INSERT INTO routines (
  name, description, agent_name, action_type, action_config,
  frequency, time_of_day, timezone, next_run_at,
  show_on_dashboard, is_active
)
SELECT
  'Daily economic indicator poll',
  'Polls each active economic indicator via its provider adapter (FRED/RBA), upserts observations with revision handling, and proposes a content beat for Charlie on a qualifying new print.',
  'simon', 'indicator_poll',
  '{"backfill_periods": 18}'::jsonb,
  'daily', '08:00', 'Australia/Melbourne',
  NOW(),
  FALSE, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM routines r
  WHERE r.name = 'Daily economic indicator poll' AND r.action_type = 'indicator_poll'
);
