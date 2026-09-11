-- ============================================================
-- CLIENT LIBRARY
-- The reference layer behind /library
-- ============================================================
-- Depends on: 20260911020000_client_tables.sql
--
-- Another table the spec bundle assumed rather than specified.
-- /library is one of the eight routes and the repository contract
-- declares LibrarySection and LibraryEntry, but no data model was
-- given for either and nothing in the live schema holds them.
--
-- knowledge_items was the obvious candidate and is the wrong one:
-- it is the Archivist's internal store, it is vector-indexed for
-- agent retrieval rather than authored for a reader, and putting
-- a client-facing reference layer in it would make every future
-- knowledge ingest a publication decision.
--
-- So: a small, authored, explicitly-published table. The publish
-- wall applies here the same as everywhere — status = 'published'
-- is what a subscriber can read, and nothing else.
-- ============================================================


-- ------------------------------------------------------------
-- client_library_sections
-- ------------------------------------------------------------
-- Sections are the first place client_type changes what is on
-- screen, so the scoping lives on the section rather than on the
-- entry: an entry belongs to one section, and the section decides
-- who sees it. One column, one decision, one place to get it
-- wrong.
-- ------------------------------------------------------------

CREATE TABLE client_library_sections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key          TEXT NOT NULL UNIQUE,   -- e.g. 'custody-models', 'sole-purpose-test'
  title        TEXT NOT NULL,

  client_type  TEXT NOT NULL
               CHECK (client_type IN ('corporate', 'smsf', 'both')),

  -- Neutral ordering within the route. Not a ranking of anything.
  sort_order   INTEGER NOT NULL DEFAULT 0,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER client_library_sections_updated_at
  BEFORE UPDATE ON client_library_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ------------------------------------------------------------
-- client_library_entries
-- ------------------------------------------------------------

CREATE TABLE client_library_entries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id            UUID NOT NULL REFERENCES client_library_sections(id) ON DELETE CASCADE,

  slug                  TEXT NOT NULL UNIQUE,
  title                 TEXT NOT NULL,
  body                  TEXT NOT NULL,      -- markdown

  regulatory_references TEXT[] NOT NULL DEFAULT '{}',

  status                TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'lex_review', 'published', 'archived')),

  -- Every entry is dated and sourced. An undated reference entry
  -- on a regulatory topic during a transition period is worse than
  -- no entry, because the reader cannot tell which regime it
  -- describes.
  last_reviewed_at      TIMESTAMPTZ,
  review_due_date       DATE,

  lex_reviewed_at       TIMESTAMPTZ,
  lex_reviewed_by       UUID REFERENCES team_members(id),

  sort_order            INTEGER NOT NULL DEFAULT 0,

  created_by            UUID REFERENCES team_members(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER client_library_entries_updated_at
  BEFORE UPDATE ON client_library_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_client_library_entries_section ON client_library_entries(section_id);

-- Same rule as prepare_templates: nothing reaches a subscriber
-- without Lex having looked at it, and a published entry with no
-- review date is an entry nobody will ever revisit.
ALTER TABLE client_library_entries ADD CONSTRAINT published_requires_lex_review
  CHECK (
    status <> 'published'
    OR (lex_reviewed_at IS NOT NULL
        AND lex_reviewed_by IS NOT NULL
        AND last_reviewed_at IS NOT NULL)
  );

COMMENT ON TABLE client_library_entries IS
  'The /library reference layer. Authored for a reader, not ingested for an agent — distinct from knowledge_items for that reason.';


-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

ALTER TABLE client_library_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_library_entries  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_library_sections_team" ON client_library_sections
  FOR ALL USING (is_team_member());

CREATE POLICY "client_library_entries_team" ON client_library_entries
  FOR ALL USING (is_team_member());

-- A subscriber sees the sections for their client_type, and the
-- published entries within them. The client_type filter is here
-- rather than in the query, so a page that forgot to filter still
-- cannot show a trustee the corporate sections.
CREATE POLICY "client_library_sections_client_read" ON client_library_sections
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND client_type IN (
      'both',
      (SELECT a.client_type
         FROM client_accounts a
        WHERE a.id = current_client_account_id())
    )
  );

CREATE POLICY "client_library_entries_client_read" ON client_library_entries
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND status = 'published'
    AND EXISTS (
      SELECT 1 FROM client_library_sections s
      WHERE s.id = client_library_entries.section_id
        AND s.client_type IN (
          'both',
          (SELECT a.client_type
             FROM client_accounts a
            WHERE a.id = current_client_account_id())
        )
    )
  );


-- ------------------------------------------------------------
-- Review calendar
-- ------------------------------------------------------------
-- The spec wants a stale library entry to become an obligation
-- rather than a discovery. compliance_obligations does not exist,
-- so this view is the queryable half and the calendar is deferred.
-- ------------------------------------------------------------

CREATE VIEW v_client_library_reviews AS
  SELECT
    e.id,
    e.slug,
    e.title,
    s.key AS section_key,
    s.client_type,
    e.status,
    e.last_reviewed_at,
    e.review_due_date,
    (e.review_due_date - CURRENT_DATE) AS days_until_review,
    e.regulatory_references
  FROM client_library_entries e
  JOIN client_library_sections s ON s.id = e.section_id
  WHERE e.status = 'published'
  ORDER BY e.review_due_date ASC NULLS LAST;


-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
-- Should fail with published_requires_lex_review:
--   INSERT INTO client_library_entries (section_id, slug, title, body, status)
--   VALUES ('<a section>', 'test', 'Test', 'x', 'published');
--
-- As a corporate subscriber, this should return zero:
--   SELECT count(*) FROM client_library_sections WHERE client_type = 'smsf';
-- ------------------------------------------------------------
