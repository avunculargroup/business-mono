-- ============================================================
-- content_image_requests — founder-initiated image actions
-- ============================================================
-- Spec: docs/features/social-post-image/feature-spec.md → UI
--
-- The /content/[id] image slot cannot reach the agents server over HTTP, so a
-- founder's "Regenerate image", "Render with this brief" or an alt-text edit
-- INSERTs a row here (status 'pending'); the agents-side
-- contentImageRequestListener claims it via Realtime (pending → working), does
-- the work, and resolves it to 'done' or 'failed' with a readable error. Same
-- web → DB → agents pattern as library_questions.
--
--   regenerate        — same brief, new render; replaces the generation group
--   render_brief      — a founder-edited brief (in `brief`), linted, then rendered
--   recheck_alt_text  — Lex re-classifies the group's alt text after an edit
--
-- The row is kept after it resolves: it is the record of who asked for what.
-- ============================================================

CREATE TABLE IF NOT EXISTS content_image_requests (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id  UUID        NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  action           TEXT        NOT NULL
                     CHECK (action IN ('regenerate', 'render_brief', 'recheck_alt_text')),
  brief            JSONB,      -- render_brief only: the founder's brief
  status           TEXT        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'working', 'done', 'failed')),
  error            TEXT,
  requested_by     UUID        REFERENCES team_members(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  CONSTRAINT content_image_requests_brief_present
    CHECK (action <> 'render_brief' OR brief IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_content_image_requests_item
  ON content_image_requests(content_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_image_requests_open
  ON content_image_requests(status)
  WHERE status IN ('pending', 'working');

CREATE OR REPLACE TRIGGER content_image_requests_updated_at
  BEFORE UPDATE ON content_image_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE content_image_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "content_image_requests_team" ON content_image_requests;
CREATE POLICY "content_image_requests_team" ON content_image_requests
  FOR ALL USING (is_team_member());

-- ── Realtime for the listener ────────────────────────────────────────────────

ALTER TABLE content_image_requests REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE content_image_requests;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- already in publication, nothing to do
END;
$$;
