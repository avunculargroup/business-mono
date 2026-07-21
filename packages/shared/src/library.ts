// ============================================================
// "Ask the library" — RAG answers over podcast transcripts
// ============================================================
// Mirrors the library_questions table. A director asks a question; the agents
// server retrieves transcript segments, synthesises an answer with citations,
// and Lex reviews it. See apps/agents/src/workflows/libraryAnswer/.

// pending → answering (listener claim) → answered | failed. The web UI treats
// pending + answering as "thinking".
export const LibraryQuestionStatus = {
  PENDING:   'pending',
  ANSWERING: 'answering',
  ANSWERED:  'answered',
  FAILED:    'failed',
} as const;
export type LibraryQuestionStatus =
  (typeof LibraryQuestionStatus)[keyof typeof LibraryQuestionStatus];

// One citation backing an answer sentence. Resolved in code from the retrieved
// segment the model cited (never hallucinated), so it always deep-links to a
// real moment: /news/podcasts/{episode_id}?t={start_seconds}.
export interface LibraryCitation {
  episode_id: string;
  episode_title: string;
  start_seconds: number | null;
  quote: string;
}

// Lex's structured verdict on a synthesised answer — same shape as the episode
// summary verdict.
export interface LibraryAnswerVerdict {
  passes: boolean;
  flags: { quote: string; issue: string }[];
  rationale: string;
  suggested_rewrite: string | null;
}

export interface LibraryQuestion {
  id: string;
  question: string;
  status: LibraryQuestionStatus;
  answer: string | null;
  citations: LibraryCitation[];
  lex_verdict: LibraryAnswerVerdict | null;
  no_answer: boolean;
  error: string | null;
  asked_by: string | null;
  created_at: string;
  answered_at: string | null;
}
