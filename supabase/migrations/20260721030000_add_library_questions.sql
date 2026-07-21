-- ============================================================
-- "Ask the library" — RAG answers over podcast transcripts (B2 elevated)
-- ============================================================
-- The transcript search (B2 minimum) already retrieves ranked segments. This
-- adds the answer layer (podcast-pages-review B2 elevated / P1-6): a director
-- types a question and gets a synthesised answer with inline citations that
-- deep-link into the exact moment in an episode.
--
-- Built on the platform's async web→agents seam (the web app can't reach the
-- agents server over HTTP): the /news/podcasts/search page INSERTs a question
-- row; the agents-side libraryQuestionListener claims it, runs the RAG pass (Rex
-- retrieves + synthesises with citations, Lex reviews for advice risk), and
-- writes the answer back. The page polls the row until it resolves.
--
-- Per D3, the answer is synthesised commentary about financial matters, so it
-- routes through Lex and is framed descriptively; lex_verdict is stored on the
-- row so the director sees the compliance signal (and so a later client-facing
-- surface behind the v_episode_library boundary can require a passing verdict).
-- ============================================================

CREATE TABLE IF NOT EXISTS library_questions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question     TEXT        NOT NULL,
  -- pending → answering (listener claim) → answered | failed.
  status       TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'answering', 'answered', 'failed')),
  answer       TEXT,                                   -- null when no_answer or failed
  -- [{ episode_id, episode_title, start_seconds, quote }] — resolved in code from
  -- the retrieved segments the model cited, so citations can't be hallucinated.
  citations    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  lex_verdict  JSONB,                                  -- Lex's structured verdict on the answer
  no_answer    BOOLEAN     NOT NULL DEFAULT FALSE,     -- retrieval found nothing relevant
  error        TEXT,                                   -- set when status = 'failed'
  asked_by     UUID        REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at  TIMESTAMPTZ
);

-- The listener's reconnect sweep looks for unclaimed questions.
CREATE INDEX IF NOT EXISTS idx_library_questions_pending
  ON library_questions (created_at) WHERE status = 'pending';

ALTER TABLE library_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "library_questions_all" ON library_questions;
CREATE POLICY "library_questions_all" ON library_questions
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));
