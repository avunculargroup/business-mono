-- ============================================================
-- REPORT INGESTION — PDF/HTML report monitoring
-- Spec: docs/features/html-pdf-monitoring/html-pdf-monitoring.md
--
-- A fifth news_sources type, `report_watch`, for publishers who
-- put a PDF on a marketing page and expect a human to notice.
-- Discovery finds URLs, acquisition stores the artefact, and the
-- extracted text is surfaced through the EXISTING news_items feed
-- so Rex scores reports with the rubric he already has.
--
-- Three invariants this schema exists to protect:
--   1. Discovery is separate from acquisition. Finding a URL and
--      deciding it is worth downloading have different failure
--      modes, so they get different tables (report_candidates vs
--      reports) — and rejections are remembered, or every run
--      re-evaluates the same sitemap rubbish.
--   2. The artefact is the record. content_hash over the raw
--      bytes is identity; the stored file is immutable and a
--      superseded revision is retained, not overwritten.
--   3. Nothing about "is this new" involves an LLM. Detection,
--      dedup and extraction quality are all deterministic; the
--      only model call downstream is Rex's existing rubric.
-- ============================================================

-- ------------------------------------------------------------
-- news_sources — additive report_watch configuration
-- ------------------------------------------------------------
ALTER TABLE news_sources DROP CONSTRAINT IF EXISTS news_sources_source_type_check;
ALTER TABLE news_sources
  ADD CONSTRAINT news_sources_source_type_check
  CHECK (source_type IN ('rss','podcast','youtube','email','report_watch'));

ALTER TABLE news_sources
  -- Ordered; the first strategy returning candidates wins (v1 choice — see the
  -- spec's open question on merging all strategies instead).
  ADD COLUMN IF NOT EXISTS detection_strategies      TEXT[]      NOT NULL DEFAULT '{}',
  -- Strategy-specific settings; shape typed in @platform/shared (ReportDetectionConfig).
  -- JSONB rather than columns because the three strategies share almost nothing.
  ADD COLUMN IF NOT EXISTS detection_config          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  -- Last run that returned at least one candidate.
  ADD COLUMN IF NOT EXISTS detection_last_success_at TIMESTAMPTZ,
  -- Reset to 0 on any candidate. The silent-scraper-failure signal Simon alerts on.
  ADD COLUMN IF NOT EXISTS detection_consecutive_empty INT       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS redistribution_default    TEXT        NOT NULL DEFAULT 'internal_only',
  ADD COLUMN IF NOT EXISTS licence_notes             TEXT,
  -- Cost-bearing control. Off by default so nothing spends money silently.
  ADD COLUMN IF NOT EXISTS ocr_enabled               BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ocr_page_limit            INT         NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS crawl_delay_seconds       INT         NOT NULL DEFAULT 5,
  -- Guards against a sitemap returning several thousand URLs in one run.
  ADD COLUMN IF NOT EXISTS max_candidates_per_run    INT         NOT NULL DEFAULT 25;

ALTER TABLE news_sources DROP CONSTRAINT IF EXISTS news_sources_redistribution_default_check;
ALTER TABLE news_sources
  ADD CONSTRAINT news_sources_redistribution_default_check
  CHECK (redistribution_default IN ('internal_only','quotable','client_shareable'));

-- A report_watch source has neither a feed_url nor an inbound_address — its
-- URLs live in detection_config — so the existing per-type location constraint
-- has to admit it explicitly.
ALTER TABLE news_sources DROP CONSTRAINT IF EXISTS news_sources_feed_required;
ALTER TABLE news_sources
  ADD CONSTRAINT news_sources_feed_required CHECK (
       (source_type IN ('rss','podcast') AND feed_url IS NOT NULL)
    OR (source_type = 'youtube'      AND youtube_channel_url IS NOT NULL)
    OR (source_type = 'email'        AND inbound_address IS NOT NULL)
    OR (source_type = 'report_watch') );

-- ------------------------------------------------------------
-- report_candidates — every URL discovery has ever surfaced,
-- including the rejections.
--
-- This table earns its place on the rejections: a sitemap diff on
-- a large publisher returns hundreds of URLs of which perhaps
-- three are reports. Without a memory of what was already
-- rejected, every run re-evaluates the same rubbish.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_candidates (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         UUID        NOT NULL REFERENCES news_sources(id) ON DELETE CASCADE,
  -- Normalised: lowercase scheme+host, tracking params stripped, fragment
  -- removed, trailing slash trimmed. Rules are versioned in
  -- apps/agents/src/lib/reportWatch/normalize.ts.
  url               TEXT        NOT NULL,
  url_hash          TEXT        NOT NULL,             -- sha256(url); UNIQUE with source_id
  raw_url           TEXT        NOT NULL,             -- as discovered, pre-normalisation
  discovery_method  TEXT        NOT NULL CHECK (discovery_method IN (
                      'rss','sitemap','index_page','manual','email_attachment')),
  title_hint        TEXT,                             -- scraped title, when the strategy had one
  published_at_hint DATE,                             -- scraped date — not authoritative
  status            TEXT        NOT NULL DEFAULT 'new' CHECK (status IN (
                      'new','queued','fetching','acquired','skipped','failed','duplicate')),
  skip_reason       TEXT        CHECK (skip_reason IS NULL OR skip_reason IN (
                      'filter_mismatch','wrong_content_type','too_large',
                      'robots_disallowed','already_acquired','manual_reject')),
  http_status       INT,
  etag              TEXT,                             -- from HEAD, for conditional GET
  last_modified     TEXT,                             -- from HEAD
  content_type      TEXT,
  content_length    BIGINT,                           -- checked against the size cap pre-download
  attempts          INT         NOT NULL DEFAULT 0,   -- three failures moves status to 'failed'
  last_attempt_at   TIMESTAMPTZ,
  last_error        TEXT,
  report_id         UUID,                             -- FK added after `reports` exists
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Updated each run the URL still appears. A URL disappearing is itself a signal.
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- reports — the acquired artefact. One row per distinct piece of
-- content, not per URL.
--
-- Why content_hash and not URL is identity: publishers re-upload
-- the same PDF at new paths and CDN-bust filenames (caught by the
-- UNIQUE on content_hash), and occasionally revise a document in
-- place (caught by the reverse case — same URL, different hash —
-- which creates a new row linked via revision_of_report_id and
-- stamps superseded_at on its predecessor). Both rows are kept:
-- deleting the version BTS actually read would defeat the point
-- of storing it.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id             UUID        REFERENCES news_sources(id) ON DELETE SET NULL,
  candidate_id          UUID        REFERENCES report_candidates(id) ON DELETE SET NULL,
  news_item_id          UUID        REFERENCES news_items(id) ON DELETE SET NULL,
  -- PDF metadata → first heading → title_hint → filename.
  title                 TEXT        NOT NULL,
  publisher             TEXT,                          -- denormalised from source at acquisition
  report_type           TEXT        NOT NULL DEFAULT 'other' CHECK (report_type IN (
                          'quarterly','annual','research_note','whitepaper',
                          'market_update','regulatory','survey','other')),
  published_at          DATE,
  -- Which of the three sources the date came from. Matters when they disagree.
  published_at_source   TEXT        CHECK (published_at_source IS NULL OR published_at_source IN (
                          'pdf_metadata','scraped','http_last_modified')),
  source_url            TEXT        NOT NULL,
  canonical_url         TEXT,                          -- landing page, when acquisition followed a hop
  file_format           TEXT        NOT NULL CHECK (file_format IN ('pdf','html')),
  storage_path          TEXT,                          -- the immutable original in the `reports` bucket
  file_name             TEXT,
  file_size_bytes       BIGINT,
  content_hash          TEXT        NOT NULL,          -- sha256 of the raw bytes — the real identity key
  page_count            INT,                           -- NULL for HTML
  word_count            INT,                           -- post-extraction
  -- Full extracted markdown. Lives here as well as in segments because Rex
  -- scores the whole document and the feed shows an excerpt — reassembling
  -- either from chunks is needless work.
  body                  TEXT,
  extraction_method     TEXT        CHECK (extraction_method IS NULL OR extraction_method IN (
                          'pdf_text_layer','ocr','html_jina','manual')),
  extraction_quality    TEXT        CHECK (extraction_quality IS NULL OR extraction_quality IN (
                          'good','partial','failed')),
  -- { chars_per_page, alpha_ratio, empty_page_count, ocr_pages }
  extraction_metrics    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  ocr_used              BOOLEAN     NOT NULL DEFAULT FALSE,
  revision_of_report_id UUID        REFERENCES reports(id) ON DELETE SET NULL,
  superseded_at         TIMESTAMPTZ,                   -- set when a revision arrives
  redistribution        TEXT        NOT NULL DEFAULT 'internal_only'
                          CHECK (redistribution IN ('internal_only','quotable','client_shareable')),
  licence_notes         TEXT,
  curator_note          TEXT,                          -- why this matters, in a human's words
  tags                  TEXT[]      NOT NULL DEFAULT '{}',
  status                TEXT        NOT NULL DEFAULT 'ingesting' CHECK (status IN (
                          'ingesting','ingested','needs_review','archived')),
  created_by            UUID        REFERENCES team_members(id) ON DELETE SET NULL,  -- NULL when automated
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deferred until `reports` existed (the two tables reference each other).
ALTER TABLE report_candidates DROP CONSTRAINT IF EXISTS report_candidates_report_id_fkey;
ALTER TABLE report_candidates
  ADD CONSTRAINT report_candidates_report_id_fkey
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- report_segments — chunked and embedded, page-anchored so a
-- retrieved passage can cite where it came from.
--
-- Publish wall: segments are written only when extraction_quality
-- is 'good' or 'partial'. A 'failed' extraction still produces a
-- stored artefact and a feed item, but no embeddings — indexing
-- garbage is worse than indexing nothing, because garbage
-- retrieves.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_segments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     UUID        NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  segment_index INT         NOT NULL,
  page_number   INT,                                   -- NULL for HTML
  heading_path  TEXT,                                  -- e.g. 'Outlook > Mining economics'
  content       TEXT        NOT NULL,
  token_count   INT,
  embedding     VECTOR(1536),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- news_items — the feed representation of a report.
-- Nothing else changes: the rubric, the feed query, the archive
-- and the detail page continue to treat items agnostically.
-- ------------------------------------------------------------
ALTER TABLE news_items
  ADD COLUMN IF NOT EXISTS report_id UUID REFERENCES reports(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- Triggers + indexes
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS report_candidates_updated_at ON report_candidates;
CREATE TRIGGER report_candidates_updated_at
  BEFORE UPDATE ON report_candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS reports_updated_at ON reports;
CREATE TRIGGER reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_report_candidates_url ON report_candidates(source_id, url_hash);
CREATE INDEX IF NOT EXISTS idx_report_candidates_status     ON report_candidates(status);
CREATE INDEX IF NOT EXISTS idx_report_candidates_source     ON report_candidates(source_id);
CREATE INDEX IF NOT EXISTS idx_report_candidates_seen       ON report_candidates(last_seen_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_content_hash   ON reports(content_hash);
CREATE INDEX IF NOT EXISTS idx_reports_source                ON reports(source_id);
CREATE INDEX IF NOT EXISTS idx_reports_published             ON reports(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status                ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_news_item             ON reports(news_item_id);

CREATE INDEX IF NOT EXISTS idx_report_segments_report        ON report_segments(report_id);
CREATE INDEX IF NOT EXISTS idx_report_segments_embedding     ON report_segments
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_news_items_report             ON news_items(report_id);

-- ------------------------------------------------------------
-- v_report_watch_health — the operational surface for the silent
-- failure problem. A scraper returning nothing looks exactly like
-- a publisher that has not published.
--
-- Counts come from scalar subqueries rather than the spec's two
-- LEFT JOINs: joining report_candidates AND reports to the same
-- source row multiplies the candidate counts by the report count.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_report_watch_health AS
  SELECT
    s.id                          AS source_id,
    s.name,
    s.is_active,
    s.detection_strategies,
    s.detection_last_success_at,
    s.detection_consecutive_empty,
    (CURRENT_DATE - s.detection_last_success_at::date) AS days_since_candidate,
    (SELECT COUNT(*) FROM report_candidates c
      WHERE c.source_id = s.id
        AND c.first_seen_at > NOW() - INTERVAL '30 days')          AS candidates_30d,
    (SELECT COUNT(*) FROM report_candidates c
      WHERE c.source_id = s.id
        AND c.status = 'acquired'
        AND c.first_seen_at > NOW() - INTERVAL '30 days')          AS acquired_30d,
    (SELECT COUNT(*) FROM report_candidates c
      WHERE c.source_id = s.id AND c.status = 'failed')            AS failed_total,
    (SELECT MAX(r.published_at) FROM reports r
      WHERE r.source_id = s.id)                                    AS latest_report_published_at
  FROM news_sources s
  WHERE s.source_type = 'report_watch'
  ORDER BY s.detection_consecutive_empty DESC, days_since_candidate DESC NULLS FIRST;

-- ------------------------------------------------------------
-- v_recent_reports — the feed/browse surface. Superseded
-- revisions are hidden here but never deleted.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_recent_reports AS
  SELECT
    r.id,
    r.title,
    r.publisher,
    r.report_type,
    r.published_at,
    (CURRENT_DATE - r.published_at) AS days_since_published,
    r.page_count,
    r.word_count,
    r.file_format,
    r.extraction_quality,
    r.ocr_used,
    r.redistribution,
    r.curator_note,
    r.status,
    r.source_url,
    r.news_item_id,
    s.name                          AS source_name,
    ni.relevance_score,
    ni.status                       AS news_item_status
  FROM reports r
  LEFT JOIN news_sources s ON s.id = r.source_id
  LEFT JOIN news_items ni  ON ni.id = r.news_item_id
  WHERE r.status <> 'archived'
    AND r.superseded_at IS NULL
  ORDER BY r.published_at DESC NULLS LAST;

-- ------------------------------------------------------------
-- search_segments() — one retrieval surface across report and
-- transcript segments.
--
-- transcript_segments were already embedded with nothing reading
-- them; adding a second orphan index would be a poor use of a
-- pgvector extension. A vector index cannot be built on a view,
-- so this unions two separately-indexed subqueries, each with its
-- own ORDER BY ... LIMIT so both HNSW indexes are used, then
-- merges.
--
-- `redistribution` rides along on every row: a restriction that
-- is lost between retrieval and drafting is the failure mode Lex
-- exists to prevent. Transcript hits carry NULL — podcasts are
-- not licence-restricted the way institutional research is.
--
-- Column names were verified against the deployed
-- transcript_segments / podcast_episodes definitions rather than
-- taken from the podcast spec.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION search_segments(
  query_embedding VECTOR(1536),
  source_types    TEXT[] DEFAULT ARRAY['report','transcript'],
  match_count     INT    DEFAULT 20
)
RETURNS TABLE (
  source_type    TEXT,
  segment_id     UUID,
  parent_id      UUID,
  parent_title   TEXT,
  locator        TEXT,
  content        TEXT,
  redistribution TEXT,
  similarity     FLOAT
)
LANGUAGE sql STABLE AS $$
  WITH report_hits AS (
    SELECT
      'report'::TEXT                                              AS source_type,
      rs.id                                                       AS segment_id,
      rs.report_id                                                AS parent_id,
      r.title                                                     AS parent_title,
      COALESCE('p. ' || rs.page_number::text, rs.heading_path)     AS locator,
      rs.content                                                  AS content,
      r.redistribution                                            AS redistribution,
      1 - (rs.embedding <=> query_embedding)                      AS similarity
    FROM report_segments rs
    JOIN reports r ON r.id = rs.report_id
    WHERE 'report' = ANY(source_types)
      AND rs.embedding IS NOT NULL
      AND r.status <> 'archived'
    ORDER BY rs.embedding <=> query_embedding
    LIMIT match_count
  ),
  transcript_hits AS (
    SELECT
      'transcript'::TEXT                                          AS source_type,
      ts.id                                                       AS segment_id,
      ts.episode_id                                               AS parent_id,
      pe.title                                                    AS parent_title,
      CASE WHEN ts.start_seconds IS NULL THEN NULL
           ELSE 'start ' || ROUND(ts.start_seconds)::text || 's' END AS locator,
      ts.content                                                  AS content,
      NULL::TEXT                                                  AS redistribution,
      1 - (ts.embedding <=> query_embedding)                      AS similarity
    FROM transcript_segments ts
    JOIN podcast_episodes pe ON pe.id = ts.episode_id
    WHERE 'transcript' = ANY(source_types)
      AND ts.embedding IS NOT NULL
    ORDER BY ts.embedding <=> query_embedding
    LIMIT match_count
  )
  SELECT * FROM report_hits
  UNION ALL
  SELECT * FROM transcript_hits
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- ------------------------------------------------------------
-- RLS — same two-person-team posture as the rest of the platform.
-- ------------------------------------------------------------
ALTER TABLE report_candidates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "report_candidates_all" ON report_candidates;
CREATE POLICY "report_candidates_all" ON report_candidates
  FOR ALL USING (auth.role() IN ('authenticated','service_role'));

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reports_all" ON reports;
CREATE POLICY "reports_all" ON reports
  FOR ALL USING (auth.role() IN ('authenticated','service_role'));

ALTER TABLE report_segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "report_segments_all" ON report_segments;
CREATE POLICY "report_segments_all" ON report_segments
  FOR ALL USING (auth.role() IN ('authenticated','service_role'));

-- ------------------------------------------------------------
-- Storage — the `reports` bucket is PRIVATE. Access is via
-- short-lived signed URLs minted server-side, never a public URL
-- sitting in rendered HTML. 50MB cap matches the acquisition
-- size guard.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('reports', 'reports', false, 52428800, null)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "reports_objects_insert" ON storage.objects;
CREATE POLICY "reports_objects_insert" ON storage.objects
  FOR INSERT TO authenticated, service_role
  WITH CHECK (bucket_id = 'reports');

DROP POLICY IF EXISTS "reports_objects_select" ON storage.objects;
CREATE POLICY "reports_objects_select" ON storage.objects
  FOR SELECT TO authenticated, service_role
  USING (bucket_id = 'reports');

DROP POLICY IF EXISTS "reports_objects_update" ON storage.objects;
CREATE POLICY "reports_objects_update" ON storage.objects
  FOR UPDATE TO authenticated, service_role
  USING (bucket_id = 'reports')
  WITH CHECK (bucket_id = 'reports');

DROP POLICY IF EXISTS "reports_objects_delete" ON storage.objects;
CREATE POLICY "reports_objects_delete" ON storage.objects
  FOR DELETE TO authenticated, service_role
  USING (bucket_id = 'reports');
