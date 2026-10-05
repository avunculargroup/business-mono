-- ============================================================
-- CORPORATE HOLDINGS — the ingest drafts the subscriber summary
-- Spec: docs/features/corporate-holdings/schema-ingest-spec.md
--       → "The ingest drafts the client_summary" (decided 29 September)
--
-- Clearance needs a hand-edited client_summary, and every one has been
-- written from scratch on the record's page. The ingest now drafts one from
-- the record's implementation facts for a person to edit.
--
-- The draft is a table of its own rather than a column on research_companies,
-- for two reasons:
--   - research_companies is readable by a Minute subscriber's session on a
--     cleared record (research_companies_client_read), and RLS is per row,
--     not per column. A draft column would put unreviewed model text one API
--     call away from a subscriber. This table is team-only.
--   - A draft column would count as content to stamp_content_updated_at, so
--     every redraft would flag a reviewed record "changed since review".
--
-- The draft is inert. Nothing reads it but /research, and clearance refuses
-- a summary that is still the draft word for word: a person has to have
-- edited it. The check is a trigger because a CHECK constraint cannot read
-- another table, and because clearance is also written by hand in SQL.
-- ============================================================

CREATE TABLE IF NOT EXISTS research_summary_drafts (
  company_id    UUID PRIMARY KEY REFERENCES research_companies(id) ON DELETE CASCADE,
  body          TEXT NOT NULL CHECK (btrim(body) <> ''),
  drafted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The Mastra run that wrote it, as treasury_events.ingest_run_id.
  ingest_run_id TEXT,
  -- The newest updated_at among the facts it was composed from. A later fact
  -- edit makes the draft stale, and the next run redrafts it.
  facts_as_of   TIMESTAMPTZ
);

COMMENT ON TABLE research_summary_drafts IS
  'A model-drafted client_summary waiting for a person to edit it. Team-only, never shown to a subscriber, and clearance refuses it unedited.';

ALTER TABLE research_summary_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "research_summary_drafts_team" ON research_summary_drafts;
CREATE POLICY "research_summary_drafts_team" ON research_summary_drafts
  FOR ALL USING (is_team_member()) WITH CHECK (is_team_member());


-- ------------------------------------------------------------
-- Clearance refuses an unedited draft
--
-- Fires on a clearance (client_cleared turning true, or client_cleared_at
-- moving) and on a summary rewritten while cleared. Whitespace is collapsed
-- before comparing, so re-flowing the draft's lines is not an edit.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION refuse_unedited_summary_draft()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.client_cleared IS TRUE
     AND (
       OLD.client_cleared IS DISTINCT FROM TRUE
       OR NEW.client_cleared_at IS DISTINCT FROM OLD.client_cleared_at
       OR NEW.client_summary IS DISTINCT FROM OLD.client_summary
     )
     AND EXISTS (
       SELECT 1 FROM research_summary_drafts d
        WHERE d.company_id = NEW.id
          AND regexp_replace(btrim(d.body), '\s+', ' ', 'g')
            = regexp_replace(btrim(COALESCE(NEW.client_summary, '')), '\s+', ' ', 'g')
     )
  THEN
    RAISE EXCEPTION 'client_summary is the unedited draft'
      USING ERRCODE = 'check_violation',
            HINT = 'Edit the drafted summary before clearing the entry.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS research_companies_refuse_unedited_draft ON research_companies;
CREATE TRIGGER research_companies_refuse_unedited_draft
  BEFORE UPDATE ON research_companies
  FOR EACH ROW EXECUTE FUNCTION refuse_unedited_summary_draft();
