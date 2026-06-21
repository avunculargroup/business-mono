-- ── Extend routines.action_type to include onchain_poll, + seed the routine ──
-- Session 2 of the On-Chain Indicators feature: the scheduled on-chain poll.
-- Simon polls each active onchain_indicator via its provider adapter
-- (mempool/coinmetrics), upserts RAW observations with revision handling, lets the
-- views derive the rest, and proposes a (compliance-sensitive) content beat on a
-- Hash-Ribbons signal change, an MVRV band cross, or a large hash-rate drop.
-- See docs/features/onchain-indicators/.

ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_action_type_check;
ALTER TABLE routines
  ADD CONSTRAINT routines_action_type_check
  CHECK (action_type IN ('research_digest', 'monitor_change', 'news_ingest',
                         'news_source_scan', 'newsletter', 'podcast_ingest',
                         'news_curation', 'indicator_poll', 'onchain_poll'));

-- One daily on-chain poll at 08:00 AEST, beside the macro indicator poll. The
-- routine runs daily; each indicator is daily-cadence, and runOnchainPoll
-- backfills ~90 days on first ingest so the views (incl. Hash Ribbons' 60-day
-- window) aren't empty on day one. Idempotent on name + action_type.
INSERT INTO routines (
  name, description, agent_name, action_type, action_config,
  frequency, time_of_day, timezone, next_run_at,
  show_on_dashboard, is_active
)
SELECT
  'Daily on-chain indicator poll',
  'Polls each active on-chain indicator via its provider adapter (mempool/coinmetrics), upserts raw observations with revision handling, lets the views derive fee share / realised price / Hash Ribbons, and proposes a compliance-sensitive content beat for Charlie on a Hash-Ribbons signal change, MVRV band cross, or large hash-rate drop.',
  'simon', 'onchain_poll',
  '{"backfill_days": 90}'::jsonb,
  'daily', '08:00', 'Australia/Melbourne',
  NOW(),
  FALSE, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM routines r
  WHERE r.name = 'Daily on-chain indicator poll' AND r.action_type = 'onchain_poll'
);
