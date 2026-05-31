-- Allow routines to launch the newsletter workflow. The newsletter is its own
-- suspendable Mastra workflow; the routine handler only *launches* it (see
-- executeRoutineWorkflow → runNewsletter → startNewsletterRun), keeping the
-- routine batch loop's semantics intact while the newsletter run suspends at
-- its own human gates.

ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_action_type_check;
ALTER TABLE routines
  ADD CONSTRAINT routines_action_type_check
  CHECK (action_type IN ('research_digest', 'monitor_change', 'news_ingest',
                         'news_source_scan', 'newsletter'));

-- Seed a dormant monthly newsletter routine. Left inactive (is_active = FALSE)
-- so it never fires until the team explicitly enables it from /routines. The
-- monthly cadence is enforced in the handler via the monthly_guard flag plus a
-- duplicate check against newsletter_runs for the current calendar month.
INSERT INTO routines (
  name, description, agent_name, action_type, action_config,
  frequency, time_of_day, timezone, next_run_at,
  show_on_dashboard, dashboard_title, is_active
)
SELECT
  'Monthly newsletter',
  'Drafts the BTS monthly newsletter from internal content + supplementary research. Suspends for human approval at story selection and final draft.',
  'charlie', 'newsletter',
  '{"time_range": "month", "story_count": 5, "target_word_count": 250, "monthly_guard": true}'::jsonb,
  'weekly', '08:00', 'Australia/Melbourne',
  NOW(),
  FALSE, 'Monthly newsletter', FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM routines r
  WHERE r.name = 'Monthly newsletter' AND r.action_type = 'newsletter'
);

-- Seed a single reusable "On-demand newsletter" routine for the /content
-- "Run newsletter" button. It stays dormant (is_active = FALSE) until the web
-- action arms it (writes the modal params into action_config and sets
-- next_run_at = NOW(), is_active = TRUE). The action_config carries one_off =
-- true so runNewsletter deactivates the routine again after launching the run —
-- it fires exactly once per click rather than recurring.
INSERT INTO routines (
  name, description, agent_name, action_type, action_config,
  frequency, time_of_day, timezone, next_run_at,
  show_on_dashboard, dashboard_title, is_active
)
SELECT
  'On-demand newsletter',
  'One-shot newsletter run triggered from the content pipeline. Armed by the web app; deactivates itself after launching.',
  'charlie', 'newsletter',
  '{"time_range": "month", "story_count": 5, "target_word_count": 250, "one_off": true}'::jsonb,
  'weekly', '08:00', 'Australia/Melbourne',
  NOW(),
  FALSE, NULL, FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM routines r
  WHERE r.name = 'On-demand newsletter' AND r.action_type = 'newsletter'
);
