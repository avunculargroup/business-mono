-- ============================================================
-- RPC: match_voice_snippets — semantic retrieval for packages/voice
-- ============================================================
-- Step 2 of the Social Campaigns build. Powers the exemplar-retrieval half of
-- the voice resolver (packages/voice). Returns the top-N voice_snippets by
-- cosine similarity to a query embedding (the beat's core_message), scoped with
-- the umbrella + override rule and weighted so starred exemplars rank up.
--
-- Scoping:
--   * p_account_id set  → the account's own snippets PLUS company-canon
--     (social_account_id IS NULL) snippets — "account + umbrella".
--   * p_account_id NULL → company-canon snippets only (non-account content such
--     as a newsletter or blog post has no account override).
-- Platform: matches the requested platform OR platform-agnostic (NULL) rows;
--   p_platform NULL imposes no platform filter.
-- Starred weighting: a flat bonus added to the cosine similarity so best-of-best
--   exemplars rank above marginally-closer non-starred ones. The bonus is a
--   parameter (star_boost) so Step 6 can tune it against real generations.
--
-- Default PUBLIC execute (authenticated + service_role), consistent with the
-- existing vector_search_* functions — no explicit GRANT needed.

CREATE OR REPLACE FUNCTION match_voice_snippets(
  query_embedding  VECTOR(1536),
  p_account_id     UUID    DEFAULT NULL,
  p_platform       TEXT    DEFAULT NULL,
  match_count      INT     DEFAULT 5,
  star_boost       FLOAT   DEFAULT 0.05,
  match_threshold  FLOAT   DEFAULT 0.0
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
    AND 1 - (vs.embedding <=> query_embedding) >= match_threshold
  ORDER BY score DESC
  LIMIT match_count;
$$;
