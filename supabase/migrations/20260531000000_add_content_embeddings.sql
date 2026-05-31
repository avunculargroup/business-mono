-- content_embeddings: vector store for RAG retrieval across internal content
-- (content_items) and relationship/meeting intel (interactions). Powers the
-- newsletter workflow's "ingest & retrieve" step. Kept separate from
-- knowledge_items.embedding because these embeddings index a different, higher-
-- churn corpus (drafts, published posts, call summaries) and are regenerated
-- whenever a source row changes. Embedding generation lives in the application
-- layer (agents server), not a DB trigger — see contentEmbeddingListener.

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS content_embeddings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table  TEXT NOT NULL CHECK (source_table IN ('content_items', 'interactions')),
  source_id     UUID NOT NULL,
  chunk_index   INT NOT NULL DEFAULT 0,
  chunk_text    TEXT NOT NULL,
  embedding     VECTOR(1536),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS content_embeddings_source_idx
  ON content_embeddings (source_table, source_id);

-- HNSW + cosine to match knowledge_items / news_items conventions.
CREATE INDEX IF NOT EXISTS content_embeddings_embedding_idx
  ON content_embeddings USING hnsw (embedding vector_cosine_ops);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE content_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_embeddings_read" ON content_embeddings;
CREATE POLICY "content_embeddings_read" ON content_embeddings
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

DROP POLICY IF EXISTS "content_embeddings_write" ON content_embeddings;
CREATE POLICY "content_embeddings_write" ON content_embeddings
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));

-- ── RPC: vector_search_content ─────────────────────────────────────────────────
-- Cosine similarity over content_embeddings, joined back to the source row so
-- callers get title/summary/excerpt/recency in one round trip. Modelled on
-- vector_search_news. A single source row may have multiple chunks; we return
-- the best-scoring chunk per source via DISTINCT ON.

CREATE OR REPLACE FUNCTION vector_search_content(
  query_embedding  VECTOR(1536),
  match_threshold  FLOAT   DEFAULT 0.5,
  match_count      INT     DEFAULT 20,
  filter_days      INT     DEFAULT NULL,
  filter_source    TEXT    DEFAULT NULL
)
RETURNS TABLE (
  source_id     UUID,
  source_table  TEXT,
  title         TEXT,
  summary       TEXT,
  body_excerpt  TEXT,
  created_at    TIMESTAMPTZ,
  similarity    FLOAT
)
LANGUAGE sql STABLE AS $$
  -- Step 1: score every chunk and join its source row.
  WITH scored AS (
    SELECT
      ce.source_id,
      ce.source_table,
      CASE ce.source_table
        WHEN 'content_items' THEN ci.title
        ELSE NULL
      END AS title,
      CASE ce.source_table
        WHEN 'content_items' THEN ci.body
        ELSE i.summary
      END AS summary,
      LEFT(ce.chunk_text, 500) AS body_excerpt,
      CASE ce.source_table
        WHEN 'content_items' THEN ci.created_at
        ELSE i.occurred_at
      END AS created_at,
      1 - (ce.embedding <=> query_embedding) AS similarity
    FROM content_embeddings ce
    LEFT JOIN content_items ci
      ON ce.source_table = 'content_items' AND ci.id = ce.source_id
    LEFT JOIN interactions i
      ON ce.source_table = 'interactions' AND i.id = ce.source_id
    WHERE ce.embedding IS NOT NULL
      AND (filter_source IS NULL OR ce.source_table = filter_source)
      AND 1 - (ce.embedding <=> query_embedding) > match_threshold
  ),
  -- Step 2: keep the best-scoring chunk per source row.
  best_per_source AS (
    SELECT DISTINCT ON (source_id) *
    FROM scored
    ORDER BY source_id, similarity DESC
  )
  -- Step 3: apply the recency window, then rank by similarity.
  SELECT source_id, source_table, title, summary, body_excerpt, created_at, similarity
  FROM best_per_source
  WHERE (
    filter_days IS NULL
    OR created_at IS NULL
    OR created_at >= NOW() - (filter_days || ' days')::INTERVAL
  )
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
