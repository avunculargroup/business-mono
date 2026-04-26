-- news_items: stores aggregated news articles for daily digest, newsletter content,
-- and market research. Kept separate from knowledge_items because news is
-- high-volume, ephemeral, and freshness-centric — a different lifecycle to curated
-- durable knowledge. Promotable to knowledge_items when an article warrants it.

-- ── Enum ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE news_category AS ENUM (
    'regulatory',    -- ASIC, ATO, APRA, government policy
    'corporate',     -- ASX companies, treasury announcements
    'macro',         -- RBA rates, AUD, inflation, economic indicators
    'international'  -- US/EU/global regulation with AU implications
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS news_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                TEXT NOT NULL,
  url                  TEXT NOT NULL UNIQUE,
  url_hash             TEXT GENERATED ALWAYS AS (md5(url)) STORED,
  source_name          TEXT NOT NULL DEFAULT '',
  published_at         TIMESTAMPTZ,
  fetched_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  body_markdown        TEXT,
  summary              TEXT,
  key_points           JSONB NOT NULL DEFAULT '[]'::jsonb,
  category             news_category NOT NULL,
  topic_tags           TEXT[] NOT NULL DEFAULT '{}',
  australian_relevance BOOLEAN NOT NULL DEFAULT TRUE,
  relevance_score      NUMERIC(3,2),
  embedding            VECTOR(1536),
  fts                  TSVECTOR GENERATED ALWAYS AS (
                         to_tsvector('english',
                           coalesce(title, '') || ' ' || coalesce(summary, ''))
                       ) STORED,
  status               TEXT NOT NULL DEFAULT 'new'
                         CHECK (status IN ('new','reviewed','archived','promoted')),
  knowledge_item_id    UUID REFERENCES knowledge_items(id) ON DELETE SET NULL,
  ingested_by          TEXT NOT NULL DEFAULT 'rex',
  routine_id           UUID REFERENCES routines(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS news_items_embedding_idx
  ON news_items USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS news_items_fts_idx
  ON news_items USING gin(fts);

CREATE INDEX IF NOT EXISTS news_items_category_idx
  ON news_items (category);

CREATE INDEX IF NOT EXISTS news_items_published_at_idx
  ON news_items (published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS news_items_status_idx
  ON news_items (status);

CREATE INDEX IF NOT EXISTS news_items_australian_idx
  ON news_items (australian_relevance, published_at DESC NULLS LAST);

-- ── Trigger ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE TRIGGER news_items_updated_at
  BEFORE UPDATE ON news_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE news_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "news_items_read" ON news_items;
CREATE POLICY "news_items_read" ON news_items
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

DROP POLICY IF EXISTS "news_items_write" ON news_items;
CREATE POLICY "news_items_write" ON news_items
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));

-- ── Realtime ─────────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE news_items;
EXCEPTION WHEN others THEN NULL; END $$;

-- ── RPC: vector_search_news ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION vector_search_news(
  query_embedding  VECTOR(1536),
  match_threshold  FLOAT   DEFAULT 0.7,
  match_count      INT     DEFAULT 20,
  filter_category  TEXT    DEFAULT NULL,
  filter_days      INT     DEFAULT 30
)
RETURNS TABLE (
  id           UUID,
  title        TEXT,
  summary      TEXT,
  category     news_category,
  published_at TIMESTAMPTZ,
  url          TEXT,
  similarity   FLOAT
)
LANGUAGE sql STABLE AS $$
  SELECT
    id, title, summary, category, published_at, url,
    1 - (embedding <=> query_embedding) AS similarity
  FROM news_items
  WHERE embedding IS NOT NULL
    AND (filter_category IS NULL OR category::TEXT = filter_category)
    AND (
      filter_days IS NULL
      OR published_at >= NOW() - (filter_days || ' days')::INTERVAL
      OR published_at IS NULL
    )
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- ── Modify routines.action_type constraint to include news_ingest ─────────────

ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_action_type_check;
ALTER TABLE routines
  ADD CONSTRAINT routines_action_type_check
  CHECK (action_type IN ('research_digest', 'monitor_change', 'news_ingest'));

-- ── Seed: four daily news ingestion routines ──────────────────────────────────
-- Idempotent: skip if a routine with the same name already exists.

INSERT INTO routines (
  name, description, agent_name, action_type, action_config,
  frequency, time_of_day, timezone, next_run_at,
  show_on_dashboard, dashboard_title, is_active
)
SELECT
  name, description, 'rex', 'news_ingest', action_config::jsonb,
  'daily', '07:00', 'Australia/Melbourne',
  NOW(),  -- trigger on first routine check after migration
  TRUE, dashboard_title, TRUE
FROM (VALUES
  (
    'News: Regulatory (AU)',
    'Daily news aggregation — ASIC, ATO, APRA, and Australian government policy on Bitcoin and digital assets.',
    '{"category": "regulatory", "queries": ["ASIC Bitcoin cryptocurrency regulation Australia 2026", "ATO Bitcoin tax treatment Australia", "APRA digital asset policy Australia"], "max_results_per_query": 5, "search_depth": "basic"}',
    'AU Regulatory news'
  ),
  (
    'News: Corporate (AU)',
    'Daily news aggregation — ASX-listed companies and Australian corporates adopting bitcoin treasury strategies.',
    '{"category": "corporate", "queries": ["ASX company Bitcoin treasury announcement", "Australian corporate Bitcoin adoption treasury"], "max_results_per_query": 5, "search_depth": "basic"}',
    'AU Corporate news'
  ),
  (
    'News: Macro (AU)',
    'Daily news aggregation — RBA interest rate decisions, AUD movements, and Australian economic indicators.',
    '{"category": "macro", "queries": ["RBA interest rates Australia 2026", "Australian inflation economic outlook AUD"], "max_results_per_query": 5, "search_depth": "basic"}',
    'AU Macro news'
  ),
  (
    'News: International',
    'Daily news aggregation — global regulatory developments with Australian implications (US ETF, EU MiCA, FASB).',
    '{"category": "international", "queries": ["US Bitcoin ETF regulation impact Australia", "EU MiCA cryptocurrency regulation", "FASB Bitcoin accounting standards"], "max_results_per_query": 5, "search_depth": "basic"}',
    'International regulatory news'
  )
) AS t(name, description, action_config, dashboard_title)
WHERE NOT EXISTS (
  SELECT 1 FROM routines r
  WHERE r.name = t.name AND r.action_type = 'news_ingest'
);
