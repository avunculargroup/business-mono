-- ============================================================
-- News sources — user-curated publications scanned via RSS/Atom
-- ============================================================
-- Adds a news_sources table (managed from the web app /news/sources
-- or by Simon) and a 'news_source_scan' routine action_type. The scan
-- routine reads every active source's feed and stores new articles in
-- the existing news_items table. Seeds one daily scan routine.
-- ============================================================

-- ── News sources ──────────────────────────────────────────────────────────────
-- One row per publication to watch. feed_url is the RSS/Atom URL the scan
-- routine actually reads; site_url is for display/linking only.

CREATE TABLE IF NOT EXISTS news_sources (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,                 -- "Bitcoin Magazine"
  site_url        TEXT,                                 -- homepage, for display/link
  feed_url        TEXT        NOT NULL UNIQUE,          -- RSS/Atom URL scanned
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  last_scanned_at TIMESTAMPTZ,
  last_status     TEXT        CHECK (last_status IN ('success', 'failed')),
  last_error      TEXT,
  created_by      UUID        REFERENCES team_members(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER news_sources_updated_at
  BEFORE UPDATE ON news_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE news_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "news_sources_all" ON news_sources;
CREATE POLICY "news_sources_all" ON news_sources
  FOR ALL
  USING  (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ── Extend routines.action_type constraint to include news_source_scan ────────

ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_action_type_check;
ALTER TABLE routines
  ADD CONSTRAINT routines_action_type_check
  CHECK (action_type IN ('research_digest', 'monitor_change', 'news_ingest', 'news_source_scan'));

-- ── Seed: one daily source-scan routine ───────────────────────────────────────
-- No-ops until the user adds sources. Idempotent on name + action_type.

INSERT INTO routines (
  name, description, agent_name, action_type, action_config,
  frequency, time_of_day, timezone, next_run_at,
  show_on_dashboard, dashboard_title, is_active
)
SELECT
  'News: Source scan',
  'Daily scan of user-curated news sources (RSS/Atom feeds) for new articles, stored in the news feed.',
  'rex', 'news_source_scan',
  '{"max_items_per_source": 10, "lookback_days": 3}'::jsonb,
  'daily', '06:30', 'Australia/Melbourne',
  NOW(),  -- trigger on first routine check after migration
  TRUE, 'News source scan', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM routines r
  WHERE r.name = 'News: Source scan' AND r.action_type = 'news_source_scan'
);
