-- ============================================================
-- Founder feedback on social drafts → distilled per-account guidelines
-- ============================================================
-- The daily social_post_from_news routine emails each founder their drafts,
-- linking to /content/{id}. This migration adds the feedback loop:
--
--   * content_feedback            — raw feedback log. The review page's server
--                                   action inserts one row per note, denormalising
--                                   platform / post_form and snapshotting the
--                                   draft text so the distiller needs no joins.
--                                   distilled_at NULL = not yet folded into the
--                                   account's guidelines (the distiller's claim
--                                   column).
--   * account_feedback_guidelines — the distilled state: one row per social
--                                   account holding a compact JSONB string[] of
--                                   standing guidelines, injected into every
--                                   future generation and editable in Brand Hub.
--                                   updated_by NULL = the distiller wrote it;
--                                   non-NULL = a human edited it.
--
-- The web→agents handoff is Realtime-driven (the web app can't reach the agents
-- server over HTTP): an INSERT on content_feedback wakes the agents-side
-- feedbackDistillListener, which claims undistilled rows and rewrites the
-- account's guideline list via the editorial agent.
-- ============================================================

-- ── content_feedback ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS content_feedback (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id   UUID        REFERENCES content_items(id) ON DELETE SET NULL,
  social_account_id UUID        NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  platform          TEXT        NOT NULL
                      CHECK (platform IN ('linkedin', 'twitter_x')),
  post_form         TEXT,                              -- denormalised from content_items at submit time
  verdict           TEXT        CHECK (verdict IN ('positive', 'negative')),  -- optional quick verdict
  feedback          TEXT        NOT NULL,
  draft_excerpt     TEXT,                              -- snapshot of the draft the feedback referred to
  created_by        UUID        REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  distilled_at      TIMESTAMPTZ                        -- NULL = not yet folded into guidelines
);

CREATE INDEX IF NOT EXISTS idx_content_feedback_undistilled
  ON content_feedback (social_account_id) WHERE distilled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_content_feedback_item
  ON content_feedback (content_item_id);

ALTER TABLE content_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "content_feedback_all" ON content_feedback;
CREATE POLICY "content_feedback_all" ON content_feedback
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ── account_feedback_guidelines ───────────────────────────────────────────────
-- Deliberately NOT a key inside social_accounts.voice_profile: that JSONB is
-- human-curated override data with merge semantics (override counting, cleaning
-- on save). A machine-rewritten list gets its own upsert target instead.

CREATE TABLE IF NOT EXISTS account_feedback_guidelines (
  social_account_id UUID        PRIMARY KEY REFERENCES social_accounts(id) ON DELETE CASCADE,
  guidelines        JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- string[]
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        UUID        REFERENCES auth.users(id)      -- NULL = distiller wrote it
);

ALTER TABLE account_feedback_guidelines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "account_feedback_guidelines_all" ON account_feedback_guidelines;
CREATE POLICY "account_feedback_guidelines_all" ON account_feedback_guidelines
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ── Realtime for the distill listener ─────────────────────────────────────────
-- REPLICA IDENTITY FULL so the full row (social_account_id in particular) is in
-- the Realtime payload — same convention as the campaign gate tables.

ALTER TABLE content_feedback REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE content_feedback;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- already in publication, nothing to do
END;
$$;
