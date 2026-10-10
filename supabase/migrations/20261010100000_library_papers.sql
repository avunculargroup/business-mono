-- ============================================================
-- MINUTE LIBRARY — PEER-REVIEWED PAPERS (Session 1: data layer)
-- Spec: docs/features/client-app/library-papers-spec.md
-- Build notes: docs/features/client-app/library-papers-build-progress.md
-- ============================================================
-- Depends on: 20260911020000_client_tables.sql (current_client_account_id)
--             20260910000000_rls_hardening.sql  (is_team_member)
--
-- The register of peer-reviewed bitcoin research behind /library/papers.
-- Four decisions live in the schema rather than in the pipeline, because a
-- pipeline that gets one of them wrong should fail, not publish:
--
--   1. What may be rehosted is decided once, per licence, by a person, in
--      paper_licences. A paper_files row is refused for any licence not
--      approved, and for any licence its own location does not carry.
--   2. Access tier is derived, not written. refresh_paper_access() computes
--      it from locations, licence decisions, the abstract and whether it may
--      be displayed, and runs whenever any of those change — so an
--      embargo lifting moves a paper up a tier and logs it, with nothing
--      for a person to remember.
--   3. Publication needs Lex, peer review, a relevant tier, an accepted
--      venue, a slug and a summary. Editing the reviewed text clears the
--      review, so a published summary cannot change under its review.
--   4. A publisher's abstract is shown verbatim only on a permission
--      signal (see paper_abstract_displayable), decided per publisher and
--      recorded like a licence. The abstract lives in its own table so that
--      rule is RLS. On papers it would be a view filter, and a subscriber
--      could read the column past the view through /rest/v1/papers.
--
-- Where this differs from the spec's reference DDL, the build-progress doc
-- says what and why.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;


-- ------------------------------------------------------------
-- paper_licences — the single source of truth for rehosting
-- ------------------------------------------------------------
-- Codes follow OpenAlex's licence vocabulary, plus arxiv-default for
-- arXiv's non-exclusive distribution licence.
--
-- Rehosting is a human decision with a name on it (the CHECK below requires
-- one). Every row is seeded unapproved, then the Session 0 decision is
-- applied below with its decider. A code not listed there stays link-out.
-- ------------------------------------------------------------

CREATE TABLE paper_licences (
  code                    TEXT PRIMARY KEY,
  name                    TEXT NOT NULL,
  url                     TEXT,
  rehost_in_paid_product  BOOLEAN NOT NULL DEFAULT FALSE,
  allows_adaptation       BOOLEAN NOT NULL DEFAULT FALSE,
  requires_attribution    BOOLEAN NOT NULL DEFAULT TRUE,
  notes                   TEXT,
  decided_by              UUID REFERENCES team_members(id),
  decided_at              TIMESTAMPTZ,
  CONSTRAINT paper_licences_rehost_is_decided CHECK (
    NOT rehost_in_paid_product OR (decided_by IS NOT NULL AND decided_at IS NOT NULL))
);

INSERT INTO paper_licences (code, name, url, allows_adaptation, requires_attribution, notes) VALUES
  ('cc-by',       'CC BY',       'https://creativecommons.org/licenses/by/4.0/',       TRUE,  TRUE,
   'Permits commercial redistribution with attribution.'),
  ('cc-by-sa',    'CC BY-SA',    'https://creativecommons.org/licenses/by-sa/4.0/',    TRUE,  TRUE,
   'Permits commercial redistribution with attribution.'),
  ('cc0',         'CC0',         'https://creativecommons.org/publicdomain/zero/1.0/', TRUE,  FALSE,
   'No rights reserved.'),
  ('public-domain','Public domain', NULL,                                              TRUE,  FALSE,
   'No rights reserved.'),
  ('cc-by-nd',    'CC BY-ND',    'https://creativecommons.org/licenses/by-nd/4.0/',    FALSE, TRUE,
   'Verbatim PDF permitted commercially. Approved for the PDF as published; no reflowed reader.'),
  ('cc-by-nc',    'CC BY-NC',    'https://creativecommons.org/licenses/by-nc/4.0/',    TRUE,  TRUE,
   'Never rehost: Minute is a paid product, which is the commercial use NC excludes. Link out.'),
  ('cc-by-nc-sa', 'CC BY-NC-SA', 'https://creativecommons.org/licenses/by-nc-sa/4.0/', TRUE,  TRUE,
   'Never rehost: Minute is a paid product, which is the commercial use NC excludes. Link out.'),
  ('cc-by-nc-nd', 'CC BY-NC-ND', 'https://creativecommons.org/licenses/by-nc-nd/4.0/', FALSE, TRUE,
   'Never rehost: Minute is a paid product, which is the commercial use NC excludes. Link out.'),
  ('arxiv-default','arXiv non-exclusive distribution licence',
   'https://arxiv.org/licenses/nonexclusive-distrib/1.0/license.html',               FALSE, TRUE,
   'Grants rights to arXiv only. Link out; never cache.'),
  ('publisher-specific-oa', 'Publisher-specific open access', NULL,                    FALSE, TRUE,
   'e.g. Elsevier user licence. Not redistributable. Link out.'),
  ('implied-oa',  'Implied open access (no licence)', NULL,                            FALSE, TRUE,
   'Free to read is not free to copy. Link out.'),
  ('other-oa',    'Other open licence', NULL,                                          FALSE, TRUE,
   'Unrecognised open licence. Link out until someone reads it.');

-- Session 0 decision, 2026-10-10, Chris Pollard. CC BY, BY-SA, CC0 and public
-- domain permit commercial redistribution with attribution. BY-ND permits it
-- verbatim only: allows_adaptation = false is what tells the reader to show
-- the PDF as published rather than reflow it. NC is never approved, because
-- Minute is the commercial use it excludes.
UPDATE paper_licences
   SET rehost_in_paid_product = TRUE,
       decided_by = '2fcaea14-6d37-4def-b56d-467d61c92f36',
       decided_at = '2026-10-10T00:00:00Z'
 WHERE code IN ('cc-by', 'cc-by-sa', 'cc0', 'public-domain', 'cc-by-nd');


-- ------------------------------------------------------------
-- paper_publishers — abstract policy, decided like a licence
-- ------------------------------------------------------------
-- Policy: docs/features/client-app/library-papers-spec.md#abstract-policy-for-paywalled-papers
--
-- A new publisher starts at summary_only and undecided. While undecided,
-- I4OA membership plus a Crossref deposit is a permission signal on its own.
-- A decision, either way, overrides that signal, which is what makes a
-- takedown one row: set summary_only with a reason, and every affected
-- paper's tier recomputes and the change is logged once, against the
-- publisher.
-- ------------------------------------------------------------

CREATE TABLE paper_publishers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL UNIQUE,
  openalex_id      TEXT UNIQUE CHECK (openalex_id ~ '^P[0-9]+$'),
  crossref_member  TEXT,
  joined_i4oa      BOOLEAN NOT NULL DEFAULT FALSE,
  abstract_policy  TEXT NOT NULL DEFAULT 'summary_only'
                   CHECK (abstract_policy IN ('display','summary_only')),
  decided_by       UUID REFERENCES team_members(id),
  decided_at       TIMESTAMPTZ,
  reason           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A decision has a name, a date and a reason, or it is not a decision.
  CONSTRAINT paper_publishers_decision_complete CHECK (
    (decided_by IS NULL AND decided_at IS NULL)
    OR (decided_by IS NOT NULL AND decided_at IS NOT NULL AND reason IS NOT NULL)),
  CONSTRAINT paper_publishers_display_is_decided CHECK (
    abstract_policy = 'summary_only' OR decided_at IS NOT NULL)
);


-- ------------------------------------------------------------
-- paper_venues
-- ------------------------------------------------------------

CREATE TABLE paper_venues (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  openalex_source_id  TEXT UNIQUE,
  issn_l              TEXT,
  issns               TEXT[],
  name                TEXT NOT NULL,
  venue_type          TEXT NOT NULL CHECK (venue_type IN ('journal','conference','book_series','repository','other')),
  publisher_id        UUID REFERENCES paper_publishers(id),
  is_in_doaj          BOOLEAN,
  homepage_url        TEXT,
  feed_url            TEXT,                          -- OJS/RSS for early detection
  -- Curated, never automatic: the field attracts predatory journals.
  -- Rejected venues stay, so they are never re-triaged.
  reputation          TEXT NOT NULL DEFAULT 'unreviewed'
                      CHECK (reputation IN ('unreviewed','accepted','watch','rejected')),
  reputation_notes    TEXT,
  first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER paper_venues_updated_at
  BEFORE UPDATE ON paper_venues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_paper_venues_publisher ON paper_venues (publisher_id);


-- ------------------------------------------------------------
-- paper_watches — standing discovery queries
-- ------------------------------------------------------------
-- Before papers, so papers.discovered_via can be a real foreign key.
-- ------------------------------------------------------------

CREATE TABLE paper_watches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  watch_type     TEXT NOT NULL CHECK (watch_type IN ('openalex_query','venue','author','cites','arxiv_category','crossref_query')),
  config         JSONB NOT NULL,                     -- e.g. {"filter":"title_and_abstract.search:bitcoin,type:article"}
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at    TIMESTAMPTZ,
  high_water     TEXT,                               -- last publication/index date seen
  hits_total     INT NOT NULL DEFAULT 0,
  promoted_total INT NOT NULL DEFAULT 0,             -- hits that reached core/substantial: watch yield
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------------------
-- papers — one row per work
-- ------------------------------------------------------------
-- Deduplicated on DOI, then OpenAlex ID, then arXiv ID. Their formats are
-- constrained here because deduplication depends on them: a DOI stored once
-- with its https://doi.org/ prefix and once without is two papers.
-- ------------------------------------------------------------

CREATE TABLE papers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doi                 TEXT UNIQUE
                      CHECK (doi ~ '^10\.[0-9]{4,9}/\S+$' AND doi = lower(doi)),
  openalex_id         TEXT UNIQUE CHECK (openalex_id ~ '^W[0-9]+$'),
  -- Versionless: 2101.00001, never 2101.00001v2.
  arxiv_id            TEXT UNIQUE CHECK (arxiv_id !~ 'v[0-9]+$'),
  slug                TEXT UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title               TEXT NOT NULL,
  venue_id            UUID REFERENCES paper_venues(id),
  publication_date    DATE,
  publication_year    INT,
  volume TEXT, issue TEXT, pages TEXT,
  language            TEXT,
  work_type           TEXT,                          -- as reported by the index
  peer_review_status  TEXT NOT NULL DEFAULT 'unknown'
                      CHECK (peer_review_status IN ('peer_reviewed','preprint','not_peer_reviewed','unknown')),
  peer_review_basis   TEXT,                          -- e.g. 'venue:journal+version:publishedVersion'
  relevance_tier      TEXT NOT NULL DEFAULT 'unscored'
                      CHECK (relevance_tier IN ('unscored','core','substantial','peripheral','excluded')),
  relevance_basis     JSONB NOT NULL DEFAULT '{}',   -- deterministic scores + Rex verdict + overrides
  -- Derived by refresh_paper_access(). Never written by the pipeline.
  access_tier         TEXT NOT NULL DEFAULT 'metadata_only'
                      CHECK (access_tier IN ('read_here','read_at_source','abstract_only','metadata_only')),
  best_licence        TEXT REFERENCES paper_licences(code),
  best_oa_url         TEXT,
  summary             JSONB,                         -- {question, data, method, findings[], limitations[], basis}
  summary_plain       TEXT,                          -- one-paragraph render, for display and embedding
  curator_note        TEXT,                          -- why it matters to a CFO/trustee, without conclusion
  topics              TEXT[] NOT NULL DEFAULT '{}',  -- controlled vocabulary
  funders             JSONB NOT NULL DEFAULT '[]',   -- as disclosed: [{name, award_id, source}]
  conflict_disclosure TEXT,                          -- verbatim COI statement where present
  is_retracted        BOOLEAN NOT NULL DEFAULT FALSE,
  cited_by_count      INT,
  cited_by_count_at   TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'candidate'
                      CHECK (status IN ('candidate','draft','lex_review','published','archived')),
  -- First time it reached subscribers. created_at is discovery, which can be
  -- months earlier, and "new since your last visit" means new to Minute.
  published_at        TIMESTAMPTZ,
  lex_reviewed_at     TIMESTAMPTZ,
  lex_reviewed_by     UUID REFERENCES team_members(id),
  lex_notes           TEXT,
  discovered_via      UUID REFERENCES paper_watches(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT papers_has_identifier CHECK (doi IS NOT NULL OR openalex_id IS NOT NULL OR arxiv_id IS NOT NULL),
  -- Retracted papers are NOT barred: a published paper that is later
  -- retracted stays visible, with its notice, because someone may already
  -- have cited it.
  CONSTRAINT papers_published_requires_lex CHECK (
    status <> 'published' OR (
      lex_reviewed_at IS NOT NULL AND lex_reviewed_by IS NOT NULL
      AND peer_review_status = 'peer_reviewed'
      AND relevance_tier IN ('core','substantial')
      AND slug IS NOT NULL
      AND summary IS NOT NULL AND summary_plain IS NOT NULL))
);

CREATE TRIGGER papers_updated_at
  BEFORE UPDATE ON papers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_papers_listing  ON papers (status, relevance_tier, publication_date DESC);
CREATE INDEX idx_papers_venue    ON papers (venue_id);
CREATE INDEX idx_papers_topics   ON papers USING GIN (topics);
CREATE INDEX idx_papers_title_trgm ON papers USING GIN (title extensions.gin_trgm_ops);

-- A Lex review describes specific text. Changing the summary or curator note
-- without a fresh review clears it — and on a published row that makes the
-- update fail papers_published_requires_lex, so live text cannot drift from
-- what was reviewed. An update that sets a new review alongside new text is
-- the reviewer attesting to that text, and stands.
CREATE OR REPLACE FUNCTION papers_review_guard() RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.summary, NEW.summary_plain, NEW.curator_note)
       IS DISTINCT FROM (OLD.summary, OLD.summary_plain, OLD.curator_note)
     AND NEW.lex_reviewed_at IS NOT DISTINCT FROM OLD.lex_reviewed_at THEN
    NEW.lex_reviewed_at := NULL;
    NEW.lex_reviewed_by := NULL;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER papers_review_guard
  BEFORE UPDATE ON papers
  FOR EACH ROW EXECUTE FUNCTION papers_review_guard();

-- Publication gate that a CHECK cannot express, because it spans tables:
-- the venue must have been reviewed and accepted. Peer review inferred from
-- a predatory journal is not peer review. Also stamps published_at.
CREATE OR REPLACE FUNCTION papers_publish_gate() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
    IF NOT EXISTS (SELECT 1 FROM paper_venues v WHERE v.id = NEW.venue_id AND v.reputation = 'accepted') THEN
      RAISE EXCEPTION 'Paper % cannot be published: its venue is missing or not accepted', NEW.id;
    END IF;
    NEW.published_at := COALESCE(NEW.published_at, NOW());
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER papers_publish_gate
  BEFORE INSERT OR UPDATE OF status ON papers
  FOR EACH ROW EXECUTE FUNCTION papers_publish_gate();


-- ------------------------------------------------------------
-- paper_abstracts — the publisher's abstract, verbatim
-- ------------------------------------------------------------
-- Its own table so paper_abstract_displayable() can be enforced by RLS.
-- The BTS summary on papers is always ours and always displayable; this
-- text may be the publisher's or the author's copyright.
-- ------------------------------------------------------------

CREATE TABLE paper_abstracts (
  paper_id      UUID PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
  abstract      TEXT NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('crossref','openalex_index','publisher_page','pdf','manual')),
  retrieved_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------------------
-- paper_locations — every known copy of a work
-- ------------------------------------------------------------

CREATE TABLE paper_locations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id         UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  host_type        TEXT NOT NULL CHECK (host_type IN ('publisher','repository','preprint_server')),
  source_name      TEXT,
  landing_url      TEXT,
  pdf_url          TEXT,
  version          TEXT CHECK (version IN ('publishedVersion','acceptedVersion','submittedVersion')),
  licence          TEXT REFERENCES paper_licences(code),
  oa_status        TEXT CHECK (oa_status IN ('diamond','gold','green','hybrid','bronze','closed')),
  is_oa            BOOLEAN NOT NULL DEFAULT FALSE,
  reported_by      TEXT NOT NULL CHECK (reported_by IN ('openalex','crossref','arxiv','manual')),
  last_checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT paper_locations_has_url CHECK (landing_url IS NOT NULL OR pdf_url IS NOT NULL),
  CONSTRAINT paper_locations_oa_consistent CHECK (oa_status IS NULL OR is_oa = (oa_status <> 'closed'))
);

-- OpenAlex reports some copies with a PDF URL and no landing page, so the
-- spec's UNIQUE (paper_id, landing_url) would let those duplicate freely.
CREATE UNIQUE INDEX paper_locations_copy_key
  ON paper_locations (paper_id, COALESCE(landing_url, pdf_url));


-- ------------------------------------------------------------
-- paper_files — hosted PDFs in the private 'papers' bucket
-- ------------------------------------------------------------

CREATE TABLE paper_files (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id          UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  location_id       UUID NOT NULL REFERENCES paper_locations(id),
  licence           TEXT NOT NULL REFERENCES paper_licences(code),   -- frozen at retrieval
  version           TEXT NOT NULL CHECK (version IN ('publishedVersion','acceptedVersion')),
  storage_path      TEXT NOT NULL UNIQUE,
  content_sha256    TEXT NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size         BIGINT,
  page_count        INT,
  full_text         TEXT,
  extraction_method TEXT CHECK (extraction_method IN ('pdf_text','ocr','jats_xml')),
  retrieved_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  withdrawn_at      TIMESTAMPTZ,                      -- set if the licence decision is later reversed
  UNIQUE (paper_id, content_sha256)
);

-- Gate: no live file for a licence BTS has not approved, and none whose
-- claimed licence and version are not what its own location reports. The
-- spec's trigger checked only the licence the inserter supplied, so a
-- pipeline could store an arXiv-default PDF by labelling it cc-by.
-- Withdrawing a file is always allowed; un-withdrawing re-runs the gate.
CREATE OR REPLACE FUNCTION enforce_paper_file_licence() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.withdrawn_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM paper_licences WHERE code = NEW.licence AND rehost_in_paid_product) THEN
    RAISE EXCEPTION 'Licence % is not approved for rehosting in Minute', NEW.licence;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM paper_locations l
     WHERE l.id = NEW.location_id AND l.paper_id = NEW.paper_id
       AND l.is_oa AND l.licence = NEW.licence AND l.version = NEW.version
  ) THEN
    RAISE EXCEPTION 'File licence % / version % does not match an open copy of paper %',
      NEW.licence, NEW.version, NEW.paper_id;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER paper_files_licence_gate
  BEFORE INSERT OR UPDATE ON paper_files
  FOR EACH ROW EXECUTE FUNCTION enforce_paper_file_licence();


-- ------------------------------------------------------------
-- paper_authors, paper_authorships
-- ------------------------------------------------------------

CREATE TABLE paper_authors (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  openalex_author_id  TEXT UNIQUE CHECK (openalex_author_id ~ '^A[0-9]+$'),
  orcid               TEXT UNIQUE CHECK (orcid ~ '^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$'),
  display_name        TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE paper_authorships (
  paper_id          UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  author_id         UUID NOT NULL REFERENCES paper_authors(id) ON DELETE CASCADE,
  author_position   INT NOT NULL CHECK (author_position >= 1),
  raw_affiliation   TEXT,                            -- as disclosed on the paper
  is_corresponding  BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (paper_id, author_id),
  UNIQUE (paper_id, author_position)
);

CREATE INDEX idx_paper_authorships_author ON paper_authorships (author_id);


-- ------------------------------------------------------------
-- paper_chunks — embedded passages for retrieval
-- ------------------------------------------------------------

CREATE TABLE paper_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id     UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  chunk_kind   TEXT NOT NULL CHECK (chunk_kind IN ('abstract','summary','curator_note','full_text')),
  section      TEXT,                                 -- 'Introduction', 'Results'… when detectable
  page_from    INT, page_to INT,
  chunk_index  INT NOT NULL,
  content      TEXT NOT NULL,
  embedding    vector(1536),
  UNIQUE (paper_id, chunk_kind, chunk_index)
);

CREATE INDEX idx_paper_chunks_embedding ON paper_chunks USING hnsw (embedding vector_cosine_ops);


-- ------------------------------------------------------------
-- paper_relations, paper_events
-- ------------------------------------------------------------

CREATE TABLE paper_relations (
  from_paper_id  UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  to_paper_id    UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  relation       TEXT NOT NULL CHECK (relation IN ('cites','published_version_of','retraction_of',
                   'correction_of','expression_of_concern_on','comment_on')),
  source         TEXT NOT NULL CHECK (source IN ('openalex','crossref','retraction-watch','manual')),
  PRIMARY KEY (from_paper_id, to_paper_id, relation),
  CHECK (from_paper_id <> to_paper_id)
);

CREATE INDEX idx_paper_relations_to ON paper_relations (to_paper_id, relation);

-- About one paper, or about one publisher: a publisher's abstract decision
-- is one event however many papers it moves. The papers' own tier changes
-- are still logged against each of them by refresh_paper_access().
CREATE TABLE paper_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id     UUID REFERENCES papers(id) ON DELETE CASCADE,
  publisher_id UUID REFERENCES paper_publishers(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL CHECK (event_type IN ('discovered','tier_changed','access_changed','licence_changed',
                 'published_version_found','retracted','corrected','concern_raised','summary_published',
                 'file_withdrawn','abstract_policy_changed')),
  from_value   TEXT,
  to_value     TEXT,
  source       TEXT NOT NULL,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT paper_events_one_subject CHECK ((paper_id IS NULL) <> (publisher_id IS NULL))
);

CREATE INDEX idx_paper_events_paper ON paper_events (paper_id, occurred_at DESC);
CREATE INDEX idx_paper_events_publisher ON paper_events (publisher_id, occurred_at DESC);
CREATE INDEX idx_paper_events_recent ON paper_events (occurred_at DESC);


-- ------------------------------------------------------------
-- Access tier — derived, reproducible, logged
-- ------------------------------------------------------------
--   read_here       an open published or accepted copy under an approved licence
--   read_at_source  any other open copy
--   abstract_only   closed, with an abstract we may display
--   metadata_only   closed, and no displayable abstract
-- Published version beats accepted manuscript; publisher beats repository.
-- ------------------------------------------------------------

-- Whether the publisher's abstract may be shown verbatim. Only on a
-- permission signal:
--   1. some copy of the paper carries CC BY, BY-SA, CC0 or public domain,
--      which licenses the abstract with the article. No publisher decision
--      overrides this: the licence is the permission;
--   2. the publisher has decided 'display', with a name and a reason;
--   3. the publisher is undecided, has joined I4OA, and this abstract came
--      from its Crossref deposit.
-- Everything else is summary_only: the BTS summary, and a link to the
-- abstract at the publisher.
--
-- It takes the abstract's source rather than reading paper_abstracts,
-- because paper_abstracts' own RLS policy calls it: reading the table from
-- here would recurse.
CREATE OR REPLACE FUNCTION paper_abstract_displayable(p_paper_id UUID, p_abstract_source TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM paper_locations l
                  WHERE l.paper_id = p_paper_id
                    AND l.licence IN ('cc-by', 'cc-by-sa', 'cc0', 'public-domain'))
      OR EXISTS (
           SELECT 1 FROM papers p
             JOIN paper_venues v ON v.id = p.venue_id
             JOIN paper_publishers pub ON pub.id = v.publisher_id
            WHERE p.id = p_paper_id
              AND ((pub.decided_at IS NOT NULL AND pub.abstract_policy = 'display')
                OR (pub.decided_at IS NULL AND pub.joined_i4oa AND p_abstract_source = 'crossref')));
$$;

CREATE OR REPLACE FUNCTION refresh_paper_access(p_paper_id UUID, p_source TEXT DEFAULT 'derived')
RETURNS TEXT AS $$
DECLARE
  old_tier     TEXT;
  old_licence  TEXT;
  new_tier     TEXT;
  new_licence  TEXT;
  new_url      TEXT;
BEGIN
  SELECT access_tier, best_licence INTO old_tier, old_licence FROM papers WHERE id = p_paper_id;
  IF NOT FOUND THEN
    RETURN NULL;   -- the paper is being deleted; its locations are cascading
  END IF;

  SELECT 'read_here', l.licence, COALESCE(l.pdf_url, l.landing_url)
    INTO new_tier, new_licence, new_url
    FROM paper_locations l
    JOIN paper_licences c ON c.code = l.licence
   WHERE l.paper_id = p_paper_id AND l.is_oa AND c.rehost_in_paid_product
     AND l.version IN ('publishedVersion','acceptedVersion')
   ORDER BY (l.version = 'publishedVersion') DESC, (l.host_type = 'publisher') DESC, l.id
   LIMIT 1;

  IF new_tier IS NULL THEN
    SELECT 'read_at_source', l.licence, COALESCE(l.landing_url, l.pdf_url)
      INTO new_tier, new_licence, new_url
      FROM paper_locations l
     WHERE l.paper_id = p_paper_id AND l.is_oa
     ORDER BY (l.version = 'publishedVersion') DESC NULLS LAST,
              (l.version = 'acceptedVersion') DESC NULLS LAST,
              (l.host_type = 'publisher') DESC, l.id
     LIMIT 1;
  END IF;

  IF new_tier IS NULL THEN
    new_tier := CASE WHEN EXISTS (
        SELECT 1 FROM paper_abstracts a
         WHERE a.paper_id = p_paper_id AND paper_abstract_displayable(p_paper_id, a.source))
      THEN 'abstract_only' ELSE 'metadata_only' END;
  END IF;

  UPDATE papers
     SET access_tier = new_tier, best_licence = new_licence, best_oa_url = new_url
   WHERE id = p_paper_id
     AND (access_tier, best_licence, best_oa_url) IS DISTINCT FROM (new_tier, new_licence, new_url);

  IF new_tier IS DISTINCT FROM old_tier THEN
    INSERT INTO paper_events (paper_id, event_type, from_value, to_value, source)
    VALUES (p_paper_id, 'access_changed', old_tier, new_tier, p_source);
  END IF;
  IF new_licence IS DISTINCT FROM old_licence THEN
    INSERT INTO paper_events (paper_id, event_type, from_value, to_value, source)
    VALUES (p_paper_id, 'licence_changed', old_licence, new_licence, p_source);
  END IF;

  RETURN new_tier;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION paper_access_on_row_change() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM refresh_paper_access(OLD.paper_id, TG_TABLE_NAME);
  END IF;
  IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT' OR NEW.paper_id <> OLD.paper_id) THEN
    PERFORM refresh_paper_access(NEW.paper_id, TG_TABLE_NAME);
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER paper_locations_refresh_access
  AFTER INSERT OR UPDATE OR DELETE ON paper_locations
  FOR EACH ROW EXECUTE FUNCTION paper_access_on_row_change();

CREATE TRIGGER paper_abstracts_refresh_access
  AFTER INSERT OR UPDATE OR DELETE ON paper_abstracts
  FOR EACH ROW EXECUTE FUNCTION paper_access_on_row_change();

CREATE OR REPLACE FUNCTION paper_access_on_paper_venue() RETURNS TRIGGER AS $$
BEGIN
  PERFORM refresh_paper_access(NEW.id, 'papers');
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER papers_refresh_access
  AFTER UPDATE OF venue_id ON papers
  FOR EACH ROW EXECUTE FUNCTION paper_access_on_paper_venue();

CREATE OR REPLACE FUNCTION paper_access_on_venue_publisher() RETURNS TRIGGER AS $$
BEGIN
  PERFORM refresh_paper_access(p.id, 'paper_venues') FROM papers p WHERE p.venue_id = NEW.id;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER paper_venues_refresh_access
  AFTER UPDATE OF publisher_id ON paper_venues
  FOR EACH ROW EXECUTE FUNCTION paper_access_on_venue_publisher();

-- A publisher decision (or its I4OA status) changing: one event against the
-- publisher, then every paper in its venues recomputes.
CREATE OR REPLACE FUNCTION paper_access_on_publisher_policy() RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.abstract_policy, NEW.decided_at IS NULL) IS DISTINCT FROM (OLD.abstract_policy, OLD.decided_at IS NULL) THEN
    INSERT INTO paper_events (publisher_id, event_type, from_value, to_value, source)
    VALUES (NEW.id, 'abstract_policy_changed',
            OLD.abstract_policy || CASE WHEN OLD.decided_at IS NULL THEN ' (undecided)' ELSE '' END,
            NEW.abstract_policy || CASE WHEN NEW.decided_at IS NULL THEN ' (undecided)' ELSE '' END,
            COALESCE(NEW.reason, 'paper_publishers'));
  END IF;
  PERFORM refresh_paper_access(p.id, 'paper_publishers')
     FROM papers p JOIN paper_venues v ON v.id = p.venue_id
    WHERE v.publisher_id = NEW.id;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER paper_publishers_refresh_access
  AFTER UPDATE OF abstract_policy, joined_i4oa, decided_at ON paper_publishers
  FOR EACH ROW EXECUTE FUNCTION paper_access_on_publisher_policy();

-- Approving or revoking a licence moves every paper with a copy under it.
-- Revoking does not withdraw stored files: v_licence_audit lists them, and
-- withdrawing is a person's call.
CREATE OR REPLACE FUNCTION paper_access_on_licence_decision() RETURNS TRIGGER AS $$
BEGIN
  PERFORM refresh_paper_access(l.paper_id, 'paper_licences')
     FROM (SELECT DISTINCT paper_id FROM paper_locations WHERE licence = NEW.code) l;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER paper_licences_refresh_access
  AFTER UPDATE OF rehost_in_paid_product ON paper_licences
  FOR EACH ROW EXECUTE FUNCTION paper_access_on_licence_decision();


-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
-- Team: everything. Subscribers: published papers and what hangs off them.
-- Chunks, events and watches stay team-only; subscriber search over chunks
-- arrives with the Session 5 search RPC, which must apply the same abstract
-- and full-text rules as the policies below.
-- ------------------------------------------------------------

ALTER TABLE paper_licences    ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_publishers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_venues      ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_watches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE papers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_abstracts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_locations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_files       ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_authors     ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_authorships ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_chunks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_relations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_events      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paper_licences_team"    ON paper_licences    FOR ALL USING (is_team_member());
CREATE POLICY "paper_publishers_team"  ON paper_publishers  FOR ALL USING (is_team_member());
CREATE POLICY "paper_venues_team"      ON paper_venues      FOR ALL USING (is_team_member());
CREATE POLICY "paper_watches_team"     ON paper_watches     FOR ALL USING (is_team_member());
CREATE POLICY "papers_team"            ON papers            FOR ALL USING (is_team_member());
CREATE POLICY "paper_abstracts_team"   ON paper_abstracts   FOR ALL USING (is_team_member());
CREATE POLICY "paper_locations_team"   ON paper_locations   FOR ALL USING (is_team_member());
CREATE POLICY "paper_files_team"       ON paper_files       FOR ALL USING (is_team_member());
CREATE POLICY "paper_authors_team"     ON paper_authors     FOR ALL USING (is_team_member());
CREATE POLICY "paper_authorships_team" ON paper_authorships FOR ALL USING (is_team_member());
CREATE POLICY "paper_chunks_team"      ON paper_chunks      FOR ALL USING (is_team_member());
CREATE POLICY "paper_relations_team"   ON paper_relations   FOR ALL USING (is_team_member());
CREATE POLICY "paper_events_team"      ON paper_events      FOR ALL USING (is_team_member());

CREATE POLICY "paper_licences_client_read" ON paper_licences
  FOR SELECT USING (current_client_account_id() IS NOT NULL);

CREATE POLICY "papers_client_read" ON papers
  FOR SELECT USING (current_client_account_id() IS NOT NULL AND status = 'published');

CREATE POLICY "paper_venues_client_read" ON paper_venues
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND EXISTS (SELECT 1 FROM papers p WHERE p.venue_id = paper_venues.id AND p.status = 'published'));

-- The abstract policy, enforced where a direct REST read cannot step
-- around it.
-- Readable by subscribers so paper_abstract_displayable() can see a
-- published paper's publisher decision, and so the page can name it.
CREATE POLICY "paper_publishers_client_read" ON paper_publishers
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM paper_venues v JOIN papers p ON p.venue_id = v.id
       WHERE v.publisher_id = paper_publishers.id AND p.status = 'published'));

CREATE POLICY "paper_abstracts_client_read" ON paper_abstracts
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND EXISTS (SELECT 1 FROM papers p WHERE p.id = paper_abstracts.paper_id AND p.status = 'published')
    AND paper_abstract_displayable(paper_abstracts.paper_id, paper_abstracts.source));

CREATE POLICY "paper_locations_client_read" ON paper_locations
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND EXISTS (SELECT 1 FROM papers p WHERE p.id = paper_locations.paper_id AND p.status = 'published'));

-- The reader needs storage_path to request a signed URL. Only live files
-- under a licence that is still approved.
CREATE POLICY "paper_files_client_read" ON paper_files
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND withdrawn_at IS NULL
    AND EXISTS (SELECT 1 FROM papers p WHERE p.id = paper_files.paper_id AND p.status = 'published')
    AND EXISTS (SELECT 1 FROM paper_licences c WHERE c.code = paper_files.licence AND c.rehost_in_paid_product));

CREATE POLICY "paper_authorships_client_read" ON paper_authorships
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND EXISTS (SELECT 1 FROM papers p WHERE p.id = paper_authorships.paper_id AND p.status = 'published'));

CREATE POLICY "paper_authors_client_read" ON paper_authors
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM paper_authorships s JOIN papers p ON p.id = s.paper_id
       WHERE s.author_id = paper_authors.id AND p.status = 'published'));

-- Both ends published, so an edge never reveals an unpublished candidate.
CREATE POLICY "paper_relations_client_read" ON paper_relations
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND EXISTS (SELECT 1 FROM papers p WHERE p.id = paper_relations.from_paper_id AND p.status = 'published')
    AND EXISTS (SELECT 1 FROM papers p WHERE p.id = paper_relations.to_paper_id AND p.status = 'published'));


-- ------------------------------------------------------------
-- Storage: the private 'papers' bucket
-- ------------------------------------------------------------
-- apps/client holds no service-role key, so the reader's signed URL is
-- created with the subscriber's own session — which means storage needs a
-- subscriber SELECT policy, scoped to exactly the objects paper_files
-- lets them see.
-- ------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('papers', 'papers', false, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "papers_objects_team_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'papers' AND public.is_team_member());

CREATE POLICY "papers_objects_team_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'papers' AND public.is_team_member());

CREATE POLICY "papers_objects_team_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'papers' AND public.is_team_member())
  WITH CHECK (bucket_id = 'papers' AND public.is_team_member());

CREATE POLICY "papers_objects_team_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'papers' AND public.is_team_member());

-- paper_files' own subscriber policy does the filtering.
CREATE POLICY "papers_objects_client_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'papers'
    AND public.current_client_account_id() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.paper_files f WHERE f.storage_path = storage.objects.name));


-- ------------------------------------------------------------
-- Views — all security_invoker, per 20261003010000
-- ------------------------------------------------------------

-- The only object Minute reads. The CHECK on papers already guarantees a
-- published row is peer-reviewed and core or substantial. abstract is NULL
-- whenever the effective policy is summary_only, here as well as hidden by
-- RLS, so the view is right for team sessions too; abstract_displayable
-- false is the page's cue to link to the abstract at the publisher instead.
-- is_retracted is always exposed.
CREATE VIEW v_minute_papers WITH (security_invoker = true) AS
  SELECT
    p.id, p.slug, p.title, p.doi, p.openalex_id, p.arxiv_id,
    v.name AS venue_name, v.venue_type, pub.name AS publisher,
    p.publication_date, p.publication_year, p.volume, p.issue, p.pages, p.language,
    p.peer_review_basis, p.relevance_tier,
    p.access_tier, p.best_licence, l.name AS licence_name, l.url AS licence_url, p.best_oa_url,
    CASE WHEN ad.displayable THEN a.abstract END AS abstract,
    CASE WHEN ad.displayable THEN a.source END AS abstract_source,
    COALESCE(ad.displayable, FALSE) AS abstract_displayable,
    p.summary, p.summary_plain, p.curator_note, p.topics,
    p.funders, p.conflict_disclosure,
    p.is_retracted, p.cited_by_count, p.cited_by_count_at,
    p.published_at, p.updated_at
  FROM papers p
  JOIN paper_venues v ON v.id = p.venue_id
  LEFT JOIN paper_publishers pub ON pub.id = v.publisher_id
  LEFT JOIN paper_abstracts a ON a.paper_id = p.id
  LEFT JOIN LATERAL (SELECT paper_abstract_displayable(p.id, a.source) AS displayable) ad ON a.paper_id IS NOT NULL
  LEFT JOIN paper_licences l ON l.code = p.best_licence
  WHERE p.status = 'published';

-- Drafts awaiting a person: core before substantial, then citations per
-- year since publication.
CREATE VIEW v_paper_review_queue WITH (security_invoker = true) AS
  SELECT
    p.id, p.title, p.status, p.relevance_tier, p.access_tier,
    p.summary->>'basis' AS summary_basis,
    p.cited_by_count, p.publication_date,
    ROUND(COALESCE(p.cited_by_count, 0)::numeric
          / GREATEST(1, EXTRACT(YEAR FROM age(CURRENT_DATE,
              COALESCE(p.publication_date, make_date(p.publication_year, 1, 1), CURRENT_DATE)))::numeric + 1),
          2) AS citations_per_year,
    v.name AS venue_name, v.reputation AS venue_reputation,
    p.created_at
  FROM papers p
  LEFT JOIN paper_venues v ON v.id = p.venue_id
  WHERE p.status IN ('draft','lex_review')
  ORDER BY (p.relevance_tier = 'core') DESC, citations_per_year DESC, p.created_at;

-- The "new journal" watch.
CREATE VIEW v_new_venues WITH (security_invoker = true) AS
  SELECT
    v.id, v.name, v.venue_type, pub.name AS publisher, pub.joined_i4oa, pub.abstract_policy,
    v.is_in_doaj, v.reputation, v.first_seen_at,
    (SELECT count(*) FROM papers p WHERE p.venue_id = v.id AND p.relevance_tier = 'core') AS core_papers
  FROM paper_venues v
  LEFT JOIN paper_publishers pub ON pub.id = v.publisher_id
  WHERE v.first_seen_at > NOW() - INTERVAL '90 days'
    AND EXISTS (SELECT 1 FROM papers p WHERE p.venue_id = v.id AND p.relevance_tier = 'core')
  ORDER BY v.first_seen_at DESC;

-- Exceptions to the licence rule, both directions.
CREATE VIEW v_licence_audit WITH (security_invoker = true) AS
  SELECT 'file_licence_not_approved'::text AS issue, f.paper_id, f.id AS file_id, f.licence, f.storage_path
    FROM paper_files f
    JOIN paper_licences c ON c.code = f.licence
   WHERE f.withdrawn_at IS NULL AND NOT c.rehost_in_paid_product
  UNION ALL
  SELECT 'read_here_without_file', p.id, NULL, p.best_licence, NULL
    FROM papers p
   WHERE p.access_tier = 'read_here'
     AND NOT EXISTS (SELECT 1 FROM paper_files f WHERE f.paper_id = p.id AND f.withdrawn_at IS NULL);


-- ------------------------------------------------------------
-- Verification (spec Session 1 acceptance)
-- ------------------------------------------------------------
-- Raises "not approved for rehosting":
--   INSERT INTO paper_files (paper_id, location_id, licence, version, storage_path, content_sha256)
--   VALUES ('<paper>', '<location>', 'cc-by-nc', 'publishedVersion', 'x.pdf', repeat('a', 64));
--
-- Returns zero for a paper still in draft:
--   SELECT count(*) FROM v_minute_papers WHERE id = '<draft paper>';
--
-- As a subscriber, returns zero:
--   SELECT count(*) FROM papers WHERE status = 'candidate';
-- ------------------------------------------------------------
