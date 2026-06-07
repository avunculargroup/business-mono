-- ============================================================
-- Podcast ingestion & transcripts
-- ============================================================
-- Extends the existing news_sources feed registry to podcasts and adds an
-- episode + transcript model. A podcast is just another feed (source_type =
-- 'podcast'); the daily 'podcast_ingest' routine fetches new episodes and
-- resolves each transcript through a waterfall (publisher <podcast:transcript>
-- tag → YouTube captions → Deepgram). Resolved transcripts are chunked and
-- embedded into transcript_segments (pgvector) for RAG, preserving per-chunk
-- timestamps so retrieval can deep-link to "Episode X at 23:14".
--
-- See docs/podcast-ingestion-spec.md and docs/podcast-ingestion-build-plan.md.
-- ============================================================

-- ── Extend news_sources with a type discriminator + podcast config ────────────

ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'rss'
  CHECK (source_type IN ('rss', 'podcast', 'youtube'));
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS youtube_channel_url TEXT;
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS transcribe_with_deepgram BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS preferred_transcript_lang TEXT NOT NULL DEFAULT 'en';
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS max_backfill_episodes INT NOT NULL DEFAULT 25;
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS max_episode_age_days INT;

-- feed_url was NOT NULL UNIQUE; a 'youtube' source has no feed URL. Make it
-- nullable, swap the inline UNIQUE for a partial unique index (so multiple NULL
-- feed_urls coexist), and enforce per-type presence with a CHECK.
ALTER TABLE news_sources ALTER COLUMN feed_url DROP NOT NULL;
ALTER TABLE news_sources DROP CONSTRAINT IF EXISTS news_sources_feed_url_key;
CREATE UNIQUE INDEX IF NOT EXISTS news_sources_feed_url_uniq
  ON news_sources (feed_url) WHERE feed_url IS NOT NULL;
ALTER TABLE news_sources DROP CONSTRAINT IF EXISTS news_sources_feed_required;
ALTER TABLE news_sources ADD CONSTRAINT news_sources_feed_required
  CHECK ( (source_type IN ('rss', 'podcast') AND feed_url IS NOT NULL)
       OR (source_type = 'youtube' AND youtube_channel_url IS NOT NULL) );

-- ── Podcast episodes ──────────────────────────────────────────────────────────
-- One row per episode. transcript_text lives here for display + Postgres FTS;
-- embeddings live in transcript_segments. source_id is NULL for brief-driven
-- ad-hoc episodes (a one-off link Simon hands Archie).

CREATE TABLE IF NOT EXISTS podcast_episodes (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id             UUID        REFERENCES news_sources(id) ON DELETE SET NULL,
  guid                  TEXT        NOT NULL,
  title                 TEXT        NOT NULL,
  description           TEXT,
  episode_url           TEXT,
  audio_url             TEXT,
  audio_mime_type       TEXT,
  duration_seconds      INT,
  youtube_url           TEXT,
  season                INT,
  episode_number        INT,
  image_url             TEXT,
  published_at          TIMESTAMPTZ,
  transcript_status     TEXT        NOT NULL DEFAULT 'pending'
    CHECK (transcript_status IN ('pending', 'resolving', 'transcribing', 'available', 'failed', 'skipped')),
  transcript_source     TEXT        CHECK (transcript_source IN ('feed_tag', 'youtube', 'deepgram', 'manual')),
  transcript_format     TEXT        CHECK (transcript_format IN ('json', 'vtt', 'srt', 'html', 'text')),
  transcript_lang       TEXT,
  transcript_text       TEXT,
  transcript_raw_url    TEXT,
  has_timestamps        BOOLEAN     NOT NULL DEFAULT false,
  deepgram_request_id   TEXT,
  transcript_error      TEXT,
  ingestion_origin      TEXT        NOT NULL DEFAULT 'feed'
    CHECK (ingestion_origin IN ('feed', 'brief', 'manual')),
  curator_note          TEXT,
  topic_tags            TEXT[]      NOT NULL DEFAULT '{}',
  transcript_fetched_at TIMESTAMPTZ,
  embedded_at           TIMESTAMPTZ,
  -- FTS over the plain-text transcript, mirroring news_items.fts.
  fts                   TSVECTOR    GENERATED ALWAYS AS (to_tsvector('english', coalesce(transcript_text, ''))) STORED,
  created_by            UUID        REFERENCES team_members(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Feed dedupe: one row per (source, guid). NULLs are distinct in Postgres, so
-- the composite unique does NOT cover ad-hoc rows — a separate partial unique
-- index enforces uniqueness on guid for brief-driven episodes (source_id NULL).
CREATE UNIQUE INDEX IF NOT EXISTS podcast_episodes_source_guid_uniq
  ON podcast_episodes (source_id, guid) WHERE source_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS podcast_episodes_adhoc_guid_uniq
  ON podcast_episodes (guid) WHERE source_id IS NULL;
-- Webhook correlation: match Deepgram callbacks back to the awaiting episode.
CREATE INDEX IF NOT EXISTS podcast_episodes_deepgram_request_idx
  ON podcast_episodes (deepgram_request_id) WHERE deepgram_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS podcast_episodes_status_idx ON podcast_episodes (transcript_status);
CREATE INDEX IF NOT EXISTS podcast_episodes_published_idx ON podcast_episodes (published_at DESC);
CREATE INDEX IF NOT EXISTS podcast_episodes_fts_idx ON podcast_episodes USING gin (fts);

CREATE OR REPLACE TRIGGER podcast_episodes_updated_at
  BEFORE UPDATE ON podcast_episodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE podcast_episodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "podcast_episodes_all" ON podcast_episodes;
CREATE POLICY "podcast_episodes_all" ON podcast_episodes
  FOR ALL
  USING  (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ── Transcript segments ───────────────────────────────────────────────────────
-- Chunked, embedded transcript content for RAG. One row per chunk. start/end
-- seconds are NULL when the source had no timestamps (html/text); present for
-- json/vtt/srt/deepgram — enabling timestamp deep-links.

CREATE TABLE IF NOT EXISTS transcript_segments (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id    UUID          NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
  segment_index INT           NOT NULL,
  start_seconds NUMERIC(10,2),
  end_seconds   NUMERIC(10,2),
  speaker       TEXT,
  content       TEXT          NOT NULL,
  token_count   INT,
  embedding     VECTOR(1536),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transcript_segments_episode_idx ON transcript_segments (episode_id);
-- HNSW + cosine to match content_embeddings / news_items conventions.
CREATE INDEX IF NOT EXISTS transcript_segments_embedding_idx
  ON transcript_segments USING hnsw (embedding vector_cosine_ops);

ALTER TABLE transcript_segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "transcript_segments_read" ON transcript_segments;
CREATE POLICY "transcript_segments_read" ON transcript_segments
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));
DROP POLICY IF EXISTS "transcript_segments_write" ON transcript_segments;
CREATE POLICY "transcript_segments_write" ON transcript_segments
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));

-- ── Views ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_podcast_ingestion_status AS
  SELECT
    e.id,
    e.title,
    e.published_at,
    e.transcript_status,
    e.transcript_source,
    e.has_timestamps,
    e.embedded_at,
    e.transcript_error,
    e.youtube_url,
    e.audio_url,
    ns.name AS source_name,
    ns.transcribe_with_deepgram
  FROM podcast_episodes e
  LEFT JOIN news_sources ns ON ns.id = e.source_id
  ORDER BY e.published_at DESC;

CREATE OR REPLACE VIEW v_episodes_awaiting_action AS
  SELECT
    e.id,
    e.title,
    e.transcript_status,
    e.deepgram_request_id,
    e.transcript_error,
    ns.name AS source_name,
    ns.transcribe_with_deepgram
  FROM podcast_episodes e
  LEFT JOIN news_sources ns ON ns.id = e.source_id
  WHERE e.transcript_status IN ('pending', 'resolving', 'transcribing', 'failed')
  ORDER BY e.created_at ASC;

-- ── RPC: vector_search_transcripts ────────────────────────────────────────────
-- Cosine similarity over transcript_segments, joined back to the episode (and
-- its source) so callers get title/provenance/timestamp in one round trip.
-- Modelled on vector_search_content BUT returns one row per matching segment
-- (no DISTINCT ON best-chunk-per-source) — timestamp deep-links need the
-- individual segment, not the best chunk per episode.

CREATE OR REPLACE FUNCTION vector_search_transcripts(
  query_embedding  VECTOR(1536),
  match_threshold  FLOAT   DEFAULT 0.5,
  match_count      INT     DEFAULT 20,
  filter_days      INT     DEFAULT NULL
)
RETURNS TABLE (
  segment_id     UUID,
  episode_id     UUID,
  episode_title  TEXT,
  source_name    TEXT,
  start_seconds  NUMERIC,
  end_seconds    NUMERIC,
  speaker        TEXT,
  content        TEXT,
  youtube_url    TEXT,
  audio_url      TEXT,
  curator_note   TEXT,
  published_at   TIMESTAMPTZ,
  similarity     FLOAT
)
LANGUAGE sql STABLE AS $$
  SELECT
    ts.id          AS segment_id,
    ts.episode_id,
    e.title        AS episode_title,
    ns.name        AS source_name,
    ts.start_seconds,
    ts.end_seconds,
    ts.speaker,
    ts.content,
    e.youtube_url,
    e.audio_url,
    e.curator_note,
    e.published_at,
    1 - (ts.embedding <=> query_embedding) AS similarity
  FROM transcript_segments ts
  JOIN podcast_episodes e ON e.id = ts.episode_id
  LEFT JOIN news_sources ns ON ns.id = e.source_id
  WHERE ts.embedding IS NOT NULL
    AND 1 - (ts.embedding <=> query_embedding) > match_threshold
    AND (
      filter_days IS NULL
      OR e.published_at IS NULL
      OR e.published_at >= NOW() - (filter_days || ' days')::INTERVAL
    )
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- ── Extend routines.action_type constraint to include podcast_ingest ──────────

ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_action_type_check;
ALTER TABLE routines
  ADD CONSTRAINT routines_action_type_check
  CHECK (action_type IN ('research_digest', 'monitor_change', 'news_ingest',
                         'news_source_scan', 'newsletter', 'podcast_ingest'));

-- ── Seed: one daily podcast-ingest routine ────────────────────────────────────
-- No-ops until the user adds podcast sources. Idempotent on name + action_type.

INSERT INTO routines (
  name, description, agent_name, action_type, action_config,
  frequency, time_of_day, timezone, next_run_at,
  show_on_dashboard, dashboard_title, is_active
)
SELECT
  'Podcast: Ingest episodes',
  'Daily ingestion of podcast feeds — new episodes plus transcripts via the waterfall (feed tag, YouTube, Deepgram), embedded for research.',
  'archie', 'podcast_ingest',
  '{"max_items_per_source": 25, "lookback_days": 14}'::jsonb,
  'daily', '06:45', 'Australia/Melbourne',
  NOW(),
  TRUE, 'Podcast ingestion', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM routines r
  WHERE r.name = 'Podcast: Ingest episodes' AND r.action_type = 'podcast_ingest'
);
