-- ============================================================
-- RPC: match_voice_snippets — account snippets take precedence over canon
-- ============================================================
-- Refines the scoping introduced in 20260605130000_add_match_voice_snippets.sql.
--
-- Before: when an account was given, retrieval pooled the account's own snippets
-- AND the company-canon (social_account_id IS NULL) snippets together and ranked
-- the mix by similarity — so a tuned account could still surface canon exemplars.
--
-- After: account snippets win outright. When the account has ANY snippet that
-- clears the platform + threshold filters, the company-canon snippets are
-- ignored for that account entirely. The canon is only a fallback — it surfaces
-- when the account has no matching snippets of its own. Non-account content
-- (p_account_id NULL) is unchanged: canon-only, as there is no override.
--
-- Signature and returned columns are unchanged, so no type regeneration needed.

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
