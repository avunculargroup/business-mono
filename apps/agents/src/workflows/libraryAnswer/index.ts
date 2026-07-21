import { supabase, transcriptVectorSearch, type TranscriptVectorSearchResult } from '@platform/db';
import { rex } from '../../agents/researcher/index.js';
import { lex, complianceVerdictSchema, type ComplianceVerdict } from '../../agents/compliance/index.js';
import { stepRequestContext } from '../../config/model.js';
import { embedTexts } from '../../lib/contentEmbeddings.js';
import { createLogger } from '../../lib/logger.js';
import { answerDraftSchema } from './schemas.js';
import {
  buildAnswerPrompt,
  buildAnswerLexPrompt,
  buildSourcesBlock,
  resolveCitations,
} from './prompts.js';

const log = createLogger('library-answer');

// library_questions isn't in the generated Database types yet (pre-migration
// regen), so access goes through a boundary cast — the same pattern the rest of
// the podcast intelligence code uses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// Match the web search's retrieval knobs: transcript_segments are long, so a
// low cosine floor is right (see podcastSearch.ts for the calibration note).
const MATCH_THRESHOLD = 0.2;
const MATCH_COUNT = 8;

// Fail-safe: a compliance gate must never fail open. If Lex errors, the verdict
// is "route to a human", never a silent pass.
const FAILSAFE_VERDICT: ComplianceVerdict = {
  passes: false,
  flags: [],
  rationale: 'Compliance review could not be completed — routing to a human for manual review.',
  suggested_rewrite: null,
};

interface QuestionRow {
  id: string;
  question: string;
  status: string;
}

/** Rex synthesises an answer grounded in the numbered sources. Returns the raw
 *  draft (answer + cited source numbers); empty answer on failure. */
async function synthesize(question: string, sourcesBlock: string) {
  const fallback = { answer: '', cited_sources: [] as number[] };
  const response = await rex.generate(
    [{ role: 'user', content: buildAnswerPrompt(question, sourcesBlock) }],
    {
      requestContext: stepRequestContext('library_answer.synthesize'),
      structuredOutput: {
        schema: answerDraftSchema,
        errorStrategy: 'fallback',
        fallbackValue: fallback,
      },
    },
  );
  return answerDraftSchema.parse(response.object ?? fallback);
}

/** Lex reviews the synthesised answer for advice risk. Never throws (fail-safe). */
async function reviewAnswer(question: string, answer: string): Promise<ComplianceVerdict> {
  try {
    const response = await lex.generate(
      [{ role: 'user', content: buildAnswerLexPrompt(question, answer) }],
      {
        requestContext: stepRequestContext('library_answer.compliance_check'),
        structuredOutput: {
          schema: complianceVerdictSchema,
          errorStrategy: 'fallback',
          fallbackValue: FAILSAFE_VERDICT,
        },
      },
    );
    return complianceVerdictSchema.parse(response.object ?? FAILSAFE_VERDICT);
  } catch {
    return FAILSAFE_VERDICT;
  }
}

/**
 * Answer one library question: retrieve transcript segments → Rex synthesises a
 * cited answer → Lex reviews it → persist. Called by libraryQuestionListener
 * after it has claimed the row (status = 'answering'). Citations are resolved in
 * code from the retrieved segments, so they always deep-link to a real moment.
 * On any failure the row is marked 'failed' so the page stops waiting.
 */
export async function answerLibraryQuestion(questionId: string): Promise<void> {
  const { data, error } = await db
    .from('library_questions')
    .select('id, question, status')
    .eq('id', questionId)
    .single();
  if (error || !data) {
    log.error({ questionId, error: error?.message }, 'question not found');
    return;
  }
  const row = data as QuestionRow;

  try {
    const [embedding] = await embedTexts([row.question]);
    const results: TranscriptVectorSearchResult[] = embedding
      ? await transcriptVectorSearch(embedding, { threshold: MATCH_THRESHOLD, count: MATCH_COUNT })
      : [];

    // Nothing relevant on file — answer honestly rather than inventing one.
    if (results.length === 0) {
      await db
        .from('library_questions')
        .update({ status: 'answered', no_answer: true, answer: null, answered_at: new Date().toISOString() })
        .eq('id', questionId);
      log.info({ questionId }, 'no relevant segments');
      return;
    }

    const draft = await synthesize(row.question, buildSourcesBlock(results));
    const answer = draft.answer.trim();
    if (!answer) {
      await db
        .from('library_questions')
        .update({ status: 'answered', no_answer: true, answer: null, answered_at: new Date().toISOString() })
        .eq('id', questionId);
      log.info({ questionId }, 'synthesis returned empty');
      return;
    }

    const citations = resolveCitations(draft.cited_sources, results);
    const verdict = await reviewAnswer(row.question, answer);

    await db
      .from('library_questions')
      .update({
        status: 'answered',
        answer,
        citations,
        lex_verdict: verdict,
        no_answer: false,
        answered_at: new Date().toISOString(),
      })
      .eq('id', questionId);

    log.info({ questionId, passes: verdict.passes, citations: citations.length }, 'answer written');
  } catch (err) {
    log.error({ err, questionId }, 'failed to answer question');
    await db
      .from('library_questions')
      .update({ status: 'failed', error: 'The answer could not be generated.', answered_at: new Date().toISOString() })
      .eq('id', questionId);
  }
}
