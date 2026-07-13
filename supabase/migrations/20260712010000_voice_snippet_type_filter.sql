-- ============================================================
-- RPC: match_voice_snippets — optional snippet_type filter
-- ============================================================
-- Adds a `p_snippet_types` argument so a caller can restrict retrieval to
-- specific snippet_type values (e.g. opener/closer). The daily social-post
-- routine uses this to pull a founder's characteristic openings and closings so
-- Charlie borrows cadence, not just words (docs/daily-social-posts.md, proposal 4).
--
-- NULL (the default) imposes no type filter, so every existing caller is
-- unchanged. The argument is added last with a DEFAULT; the JS caller (PostgREST)
-- resolves arguments by name, so positional order is irrelevant to it.
--
-- Adding a parameter changes the function's identity, so DROP the prior
-- six-argument signature first, then recreate on the precedence-aware body from
-- 20260630010000_voice_snippet_account_precedence.sql. The function is RPC-only
-- (no view or table depends on it), so DROP is safe.

DROP FUNCTION IF EXISTS match_voice_snippets(VECTOR(1536), UUID, TEXT, INT, FLOAT, FLOAT);

CREATE OR REPLACE FUNCTION match_voice_snippets(
  query_embedding  VECTOR(1536),
  p_account_id     UUID     DEFAULT NULL,
  p_platform       TEXT     DEFAULT NULL,
  match_count      INT      DEFAULT 5,
  star_boost       FLOAT    DEFAULT 0.05,
  match_threshold  FLOAT    DEFAULT 0.0,
  p_snippet_types  TEXT[]   DEFAULT NULL
)
RETURNS TABLE (
  id                UUID,
  social_account_id UUID,
  snippet_type      TEXT,
  body              TEXT,
  curator_note      TEXT,
  platform          TEXT,
  topic_tags        TEXT[],
  is_starred        BOOLEAN,
  similarity        FLOAT,
  score             FLOAT
)
LANGUAGE sql STABLE AS $$
  WITH candidates AS (
    SELECT
      vs.id,
      vs.social_account_id,
      vs.snippet_type,
      vs.body,
      vs.curator_note,
      vs.platform,
      vs.topic_tags,
      vs.is_starred,
      1 - (vs.embedding <=> query_embedding) AS similarity,
      (1 - (vs.embedding <=> query_embedding))
        + (CASE WHEN vs.is_starred THEN star_boost ELSE 0 END) AS score
    FROM voice_snippets vs
    WHERE vs.embedding IS NOT NULL
      -- Account + umbrella when an account is given; umbrella only otherwise.
      AND (
        (p_account_id IS NOT NULL
          AND (vs.social_account_id = p_account_id OR vs.social_account_id IS NULL))
        OR
        (p_account_id IS NULL AND vs.social_account_id IS NULL)
      )
      -- Platform match or platform-agnostic; no filter when p_platform is NULL.
      AND (p_platform IS NULL OR vs.platform = p_platform OR vs.platform IS NULL)
      -- Optional snippet_type restriction; no filter when p_snippet_types is NULL.
      AND (p_snippet_types IS NULL OR vs.snippet_type = ANY(p_snippet_types))
      AND 1 - (vs.embedding <=> query_embedding) >= match_threshold
  )
  SELECT
    c.id,
    c.social_account_id,
    c.snippet_type,
    c.body,
    c.curator_note,
    c.platform,
    c.topic_tags,
    c.is_starred,
    c.similarity,
    c.score
  FROM candidates c
  WHERE
    -- Account snippets take precedence: if the account has any of its own
    -- matching snippets, drop the company-canon ones. Falls through to canon
    -- only when the account has none (NOT EXISTS is true), and is always true
    -- for non-account content (p_account_id NULL → no account rows exist).
    NOT EXISTS (
      SELECT 1 FROM candidates a WHERE a.social_account_id = p_account_id
    )
    OR c.social_account_id = p_account_id
  ORDER BY score DESC
  LIMIT match_count;
$$;
