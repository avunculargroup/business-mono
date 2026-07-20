-- ============================================================
-- Market report feedback → distilled narration guidelines
-- ============================================================
-- The daily market_report email links to /market-reports/{id}; founders leave
-- feedback there. This mirrors the social-draft loop (20260717010000):
--
--   * market_report_feedback   — raw feedback log. The review page's server
--                                action inserts one row per note, snapshotting
--                                a narration excerpt so the distiller needs no
--                                joins. distilled_at NULL = not yet folded into
--                                the guidelines (the distiller's claim column).
--   * market_report_guidelines — the distilled state: a SINGLETON row (one
--                                report stream, unlike per-account social
--                                guidelines) holding a compact JSONB string[]
--                                injected into every future narration.
--                                updated_by NULL = the distiller wrote it.
--
-- The web→agents handoff is Realtime-driven: an INSERT on
-- market_report_feedback wakes the agents-side marketReportFeedbackListener.

-- ── market_report_feedback ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS market_report_feedback (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  market_report_id   UUID        REFERENCES market_reports(id) ON DELETE SET NULL,
  verdict            TEXT        CHECK (verdict IN ('positive', 'negative')),  -- optional quick verdict
  feedback           TEXT        NOT NULL,
  narration_excerpt  TEXT,                              -- snapshot of the narration the feedback referred to
  created_by         UUID        REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  distilled_at       TIMESTAMPTZ                        -- NULL = not yet folded into guidelines
);

CREATE INDEX IF NOT EXISTS idx_market_report_feedback_undistilled
  ON market_report_feedback (created_at) WHERE distilled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_market_report_feedback_report
  ON market_report_feedback (market_report_id);

ALTER TABLE market_report_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "market_report_feedback_all" ON market_report_feedback;
CREATE POLICY "market_report_feedback_all" ON market_report_feedback
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ── market_report_guidelines (singleton) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS market_report_guidelines (
  id          SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  guidelines  JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- string[]
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID        REFERENCES auth.users(id)      -- NULL = distiller wrote it
);

ALTER TABLE market_report_guidelines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "market_report_guidelines_all" ON market_report_guidelines;
CREATE POLICY "market_report_guidelines_all" ON market_report_guidelines
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ── Realtime for the distill listener ─────────────────────────────────────────

ALTER TABLE market_report_feedback REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE market_report_feedback;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- already in publication, nothing to do
END;
$$;
