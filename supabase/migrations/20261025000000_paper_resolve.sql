-- ============================================================
-- MINUTE LIBRARY — PAPERS (Session 2: discovery and resolution)
-- Spec: docs/features/client-app/library-papers-spec.md#ingestion-and-watch-pipeline
-- Build notes: docs/features/client-app/library-papers-build-progress.md
-- ============================================================
-- Depends on: 20261018100000_library_papers.sql
--
-- 1. commit_paper_resolve(payload): one paperResolve result written in one
--    transaction. PostgREST has none, and a paper whose locations landed
--    without its relations (or the reverse) would sit at a tier no rule set.
-- 2. routines.action_type gains paper_watch, and the daily watch routine is
--    seeded INACTIVE, like the research ingest: the first run is started by
--    hand and watched, then switched on from /routines.
-- 3. The default standing query: bitcoin in the title or abstract.
-- ============================================================


-- ------------------------------------------------------------
-- commit_paper_resolve
-- ------------------------------------------------------------
-- Payload (built by apps/agents/src/workflows/papers/commit.ts):
--   identifiers    {doi, openalex_id, arxiv_id, handle, source_url}
--   title, publication_date, publication_year, language, work_type
--   venue          {openalex_source_id, name, venue_type, issn_l, issns[], publisher, is_in_doaj} | null
--   peer_review_status, peer_review_basis
--   relevance_tier, relevance_basis, topics[]
--   funders, cited_by_count
--   abstract       {text, source} | null
--   locations[]    {host_type, source_name, landing_url, pdf_url, doi, version, licence,
--                   oa_status, is_oa, reported_by, verified_at_host}
--   authors[]      {openalex_author_id, orcid, display_name, position, raw_affiliation, is_corresponding}
--   updates[]      {kind: retracted|corrected|concern_raised, notice_doi, source}
--   reconciled[]   {rule, input, verdict}
--   published_version_doi   the published work a draft belongs to; committed first
--   discovered_via          paper_watches.id | null
--
-- Deduplicates on DOI, then OpenAlex ID, arXiv ID, handle, source URL —
-- never on a title (reconciliation rule 5).
--
-- What a re-run may change: metadata, copies, citations, retraction state.
-- What it may not: classification once a paper has left 'candidate', or one a
-- person has overridden (relevance_basis.override). A published paper's tier
-- moving under its review would fail the publication CHECK, and a person's
-- call outranks the pipeline's.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION commit_paper_resolve(payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ids       JSONB := payload->'identifiers';
  v         JSONB := payload->'venue';
  pid       UUID;
  vid       UUID;
  existing  papers%ROWTYPE;
  loc       JSONB;
  a         JSONB;
  u         JSONB;
  r         JSONB;
  lid       UUID;
  aid       UUID;
  target    UUID;
  touched   UUID[] := '{}';
  src       TEXT := 'paperResolve';
  new_doi   TEXT := ids->>'doi';
  new_oa    TEXT := ids->>'openalex_id';
  inserted  INT;
BEGIN
  -- ── Identity ──────────────────────────────────────────────
  IF new_doi IS NOT NULL THEN SELECT id INTO pid FROM papers WHERE doi = new_doi; END IF;
  IF pid IS NULL AND new_oa IS NOT NULL THEN SELECT id INTO pid FROM papers WHERE openalex_id = new_oa; END IF;
  IF pid IS NULL AND ids->>'arxiv_id' IS NOT NULL THEN SELECT id INTO pid FROM papers WHERE arxiv_id = ids->>'arxiv_id'; END IF;
  IF pid IS NULL AND ids->>'handle' IS NOT NULL THEN SELECT id INTO pid FROM papers WHERE handle = ids->>'handle'; END IF;
  IF pid IS NULL AND ids->>'source_url' IS NOT NULL THEN SELECT id INTO pid FROM papers WHERE source_url = ids->>'source_url'; END IF;

  -- ── Venue ─────────────────────────────────────────────────
  IF v IS NOT NULL AND v->>'name' IS NOT NULL THEN
    IF v->>'openalex_source_id' IS NOT NULL THEN
      SELECT id INTO vid FROM paper_venues WHERE openalex_source_id = v->>'openalex_source_id';
    END IF;
    IF vid IS NULL AND v->>'issn_l' IS NOT NULL THEN
      SELECT id INTO vid FROM paper_venues WHERE issn_l = v->>'issn_l' ORDER BY created_at LIMIT 1;
    END IF;
    IF vid IS NULL THEN
      SELECT id INTO vid FROM paper_venues
       WHERE lower(name) = lower(v->>'name') AND openalex_source_id IS NULL ORDER BY created_at LIMIT 1;
    END IF;
    IF vid IS NULL THEN
      INSERT INTO paper_venues (openalex_source_id, name, venue_type, issn_l, issns, publisher, is_in_doaj)
      VALUES (v->>'openalex_source_id', v->>'name', COALESCE(v->>'venue_type', 'other'), v->>'issn_l',
              ARRAY(SELECT jsonb_array_elements_text(COALESCE(v->'issns', '[]'::jsonb))),
              v->>'publisher', (v->>'is_in_doaj')::boolean)
      RETURNING id INTO vid;
    END IF;
  END IF;

  -- ── The paper ─────────────────────────────────────────────
  IF pid IS NULL THEN
    INSERT INTO papers (
      doi, openalex_id, arxiv_id, handle, source_url, title, venue_id,
      publication_date, publication_year, language, work_type,
      peer_review_status, peer_review_basis, relevance_tier, relevance_basis, topics,
      funders, cited_by_count, cited_by_count_at, discovered_via)
    VALUES (
      new_doi, new_oa, ids->>'arxiv_id', ids->>'handle', ids->>'source_url', payload->>'title', vid,
      (payload->>'publication_date')::date, (payload->>'publication_year')::int, payload->>'language', payload->>'work_type',
      payload->>'peer_review_status', payload->>'peer_review_basis', payload->>'relevance_tier',
      COALESCE(payload->'relevance_basis', '{}'::jsonb),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(payload->'topics', '[]'::jsonb))),
      COALESCE(payload->'funders', '[]'::jsonb), (payload->>'cited_by_count')::int,
      CASE WHEN payload->>'cited_by_count' IS NOT NULL THEN NOW() END,
      (payload->>'discovered_via')::uuid)
    RETURNING id INTO pid;
    INSERT INTO paper_events (paper_id, event_type, to_value, source)
    VALUES (pid, 'discovered', COALESCE(new_doi, new_oa, ids->>'handle', ids->>'source_url'), src);
  ELSE
    SELECT * INTO existing FROM papers WHERE id = pid;
    UPDATE papers SET
      -- Fill identifiers the row lacks, without taking one another row holds.
      doi        = COALESCE(doi, CASE WHEN NOT EXISTS (SELECT 1 FROM papers p WHERE p.doi = new_doi) THEN new_doi END),
      openalex_id = COALESCE(openalex_id, CASE WHEN NOT EXISTS (SELECT 1 FROM papers p WHERE p.openalex_id = new_oa) THEN new_oa END),
      arxiv_id   = COALESCE(arxiv_id, CASE WHEN NOT EXISTS (SELECT 1 FROM papers p WHERE p.arxiv_id = ids->>'arxiv_id') THEN ids->>'arxiv_id' END),
      title            = payload->>'title',
      venue_id         = COALESCE(vid, venue_id),
      publication_date = COALESCE((payload->>'publication_date')::date, publication_date),
      publication_year = COALESCE((payload->>'publication_year')::int, publication_year),
      language         = COALESCE(payload->>'language', language),
      work_type        = COALESCE(payload->>'work_type', work_type),
      funders          = COALESCE(payload->'funders', funders),
      cited_by_count   = COALESCE((payload->>'cited_by_count')::int, cited_by_count),
      cited_by_count_at = CASE WHEN payload->>'cited_by_count' IS NOT NULL THEN NOW() ELSE cited_by_count_at END
    WHERE id = pid;

    IF existing.status = 'candidate' AND NOT (existing.relevance_basis ? 'override') THEN
      UPDATE papers SET
        peer_review_status = payload->>'peer_review_status',
        peer_review_basis  = payload->>'peer_review_basis',
        relevance_tier     = payload->>'relevance_tier',
        relevance_basis    = COALESCE(payload->'relevance_basis', '{}'::jsonb),
        topics             = ARRAY(SELECT jsonb_array_elements_text(COALESCE(payload->'topics', '[]'::jsonb)))
      WHERE id = pid;
      IF existing.relevance_tier IS DISTINCT FROM payload->>'relevance_tier' AND existing.relevance_tier <> 'unscored' THEN
        INSERT INTO paper_events (paper_id, event_type, from_value, to_value, source)
        VALUES (pid, 'tier_changed', existing.relevance_tier, payload->>'relevance_tier', src);
      END IF;
    END IF;
  END IF;

  -- ── Abstract (stays internal unless the paper is read_here) ─
  IF payload->'abstract' IS NOT NULL AND payload->'abstract'->>'text' IS NOT NULL THEN
    INSERT INTO paper_abstracts (paper_id, abstract, source)
    VALUES (pid, payload->'abstract'->>'text', payload->'abstract'->>'source')
    ON CONFLICT (paper_id) DO UPDATE
      SET abstract = EXCLUDED.abstract, source = EXCLUDED.source, retrieved_at = NOW();
  END IF;

  -- ── Copies ────────────────────────────────────────────────
  -- Matched on the URL key or the copy's DOI; each write recomputes the tier
  -- through the location triggers. Pipeline copies no longer reported are
  -- removed, except one a stored file was taken from, and a person's
  -- ('manual') copies are never touched.
  FOR loc IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'locations', '[]'::jsonb)) LOOP
    lid := NULL;
    SELECT id INTO lid FROM paper_locations
     WHERE paper_id = pid
       AND (COALESCE(landing_url, pdf_url) = COALESCE(loc->>'landing_url', loc->>'pdf_url')
            OR (doi IS NOT NULL AND doi = loc->>'doi'))
     LIMIT 1;
    IF lid IS NULL THEN
      INSERT INTO paper_locations (paper_id, host_type, source_name, landing_url, pdf_url, doi, version,
                                   licence, oa_status, is_oa, reported_by, verified_at_host, last_checked_at)
      VALUES (pid, loc->>'host_type', loc->>'source_name', loc->>'landing_url', loc->>'pdf_url', loc->>'doi',
              loc->>'version', loc->>'licence', loc->>'oa_status', (loc->>'is_oa')::boolean,
              loc->>'reported_by', (loc->>'verified_at_host')::boolean, NOW())
      RETURNING id INTO lid;
    ELSE
      UPDATE paper_locations SET
        host_type = loc->>'host_type', source_name = loc->>'source_name',
        landing_url = loc->>'landing_url', pdf_url = loc->>'pdf_url', doi = loc->>'doi',
        version = loc->>'version', licence = loc->>'licence', oa_status = loc->>'oa_status',
        is_oa = (loc->>'is_oa')::boolean, reported_by = loc->>'reported_by',
        verified_at_host = (loc->>'verified_at_host')::boolean, last_checked_at = NOW()
      WHERE id = lid AND reported_by <> 'manual';
    END IF;
    touched := touched || lid;
  END LOOP;

  DELETE FROM paper_locations l
   WHERE l.paper_id = pid AND l.reported_by <> 'manual' AND NOT (l.id = ANY (touched))
     AND NOT EXISTS (SELECT 1 FROM paper_files f WHERE f.location_id = l.id);

  -- ── Authors ───────────────────────────────────────────────
  DELETE FROM paper_authorships WHERE paper_id = pid;
  FOR a IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'authors', '[]'::jsonb)) LOOP
    aid := NULL;
    IF a->>'openalex_author_id' IS NOT NULL THEN
      SELECT id INTO aid FROM paper_authors WHERE openalex_author_id = a->>'openalex_author_id';
    END IF;
    IF aid IS NULL AND a->>'orcid' IS NOT NULL THEN
      SELECT id INTO aid FROM paper_authors WHERE orcid = a->>'orcid';
    END IF;
    IF aid IS NULL AND a->>'openalex_author_id' IS NULL AND a->>'orcid' IS NULL THEN
      SELECT id INTO aid FROM paper_authors
       WHERE display_name = a->>'display_name' AND openalex_author_id IS NULL AND orcid IS NULL LIMIT 1;
    END IF;
    IF aid IS NULL THEN
      INSERT INTO paper_authors (openalex_author_id, orcid, display_name)
      VALUES (a->>'openalex_author_id', a->>'orcid', a->>'display_name')
      RETURNING id INTO aid;
    ELSE
      UPDATE paper_authors
         SET display_name = a->>'display_name',
             orcid = COALESCE(orcid, CASE WHEN NOT EXISTS (SELECT 1 FROM paper_authors x WHERE x.orcid = a->>'orcid') THEN a->>'orcid' END)
       WHERE id = aid;
    END IF;
    INSERT INTO paper_authorships (paper_id, author_id, author_position, raw_affiliation, is_corresponding)
    VALUES (pid, aid, (a->>'position')::int, a->>'raw_affiliation', COALESCE((a->>'is_corresponding')::boolean, FALSE))
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ── A draft's published version (rule 4) ──────────────────
  IF payload->>'published_version_doi' IS NOT NULL THEN
    SELECT id INTO target FROM papers WHERE doi = payload->>'published_version_doi';
    IF target IS NOT NULL AND target <> pid THEN
      INSERT INTO paper_relations (from_paper_id, to_paper_id, relation, source)
      VALUES (target, pid, 'published_version_of', 'openalex')
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS inserted = ROW_COUNT;
      IF inserted > 0 THEN
        INSERT INTO paper_events (paper_id, event_type, to_value, source)
        VALUES (pid, 'published_version_found', payload->>'published_version_doi', src);
      END IF;
    END IF;
  END IF;

  -- ── Notices ───────────────────────────────────────────────
  -- Retraction is one-way: a later run that no longer sees the notice does
  -- not un-retract a paper. Each notice is logged once.
  FOR u IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'updates', '[]'::jsonb)) LOOP
    IF u->>'kind' = 'retracted' THEN
      UPDATE papers SET is_retracted = TRUE WHERE id = pid AND NOT is_retracted;
      GET DIAGNOSTICS inserted = ROW_COUNT;
      IF inserted > 0 THEN
        INSERT INTO paper_events (paper_id, event_type, from_value, to_value, source)
        VALUES (pid, 'retracted', 'false', u->>'notice_doi', u->>'source');
      END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM paper_events
                       WHERE paper_id = pid AND event_type = u->>'kind'
                         AND to_value IS NOT DISTINCT FROM u->>'notice_doi') THEN
      INSERT INTO paper_events (paper_id, event_type, to_value, source)
      VALUES (pid, u->>'kind', u->>'notice_doi', u->>'source');
    END IF;
  END LOOP;

  -- ── Reconciliation verdicts, each logged once ─────────────
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'reconciled', '[]'::jsonb)) LOOP
    IF NOT EXISTS (SELECT 1 FROM paper_events WHERE paper_id = pid AND event_type = 'reconciled' AND detail = r) THEN
      INSERT INTO paper_events (paper_id, event_type, detail, source) VALUES (pid, 'reconciled', r, src);
    END IF;
  END LOOP;

  RETURN pid;
END;
$$;

-- Called only by the agents server's service-role client. Supabase grants new
-- public functions to anon and authenticated directly, so revoke by name.
REVOKE ALL ON FUNCTION commit_paper_resolve(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION commit_paper_resolve(JSONB) TO service_role;


-- ------------------------------------------------------------
-- Routine: the daily watch
-- ------------------------------------------------------------

ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_action_type_check;
ALTER TABLE routines
  ADD CONSTRAINT routines_action_type_check
  CHECK (action_type IN ('research_digest', 'monitor_change', 'news_ingest',
                         'news_source_scan', 'newsletter', 'podcast_ingest',
                         'news_curation', 'indicator_poll', 'onchain_poll',
                         'social_post_from_news', 'market_report',
                         'report_watch_scan', 'research_ingest', 'paper_watch'));

-- Daily at 06:00 Melbourne (AEST/AEDT), the spec's slot. Seeded inactive.
INSERT INTO routines (
  name, description, agent_name, action_type, action_config,
  frequency, time_of_day, timezone, next_run_at,
  show_on_dashboard, dashboard_title, is_active
)
SELECT
  'Daily library papers watch',
  'Runs every active paper watch from its high-water mark, then resolves each new work: OpenAlex and Crossref metadata, the source reconciliation rules, peer-review status, a relevance tier Rex confirms, and the access tier. New papers land as candidates; nothing is published.',
  'rex', 'paper_watch',
  '{"max_resolve_per_run": 100}'::jsonb,
  'daily', '06:00', 'Australia/Melbourne',
  NOW(),
  TRUE, 'Library papers watch', FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM routines r WHERE r.name = 'Daily library papers watch' AND r.action_type = 'paper_watch'
);


-- ------------------------------------------------------------
-- The default standing query
-- ------------------------------------------------------------
-- Bitcoin in the title or abstract, any type. Relevance and peer review are
-- decided per work afterwards, so the query stays broad on purpose.

INSERT INTO paper_watches (name, watch_type, config)
SELECT 'Bitcoin in title or abstract', 'openalex_query',
       '{"filter": "title_and_abstract.search:bitcoin"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM paper_watches WHERE name = 'Bitcoin in title or abstract');
