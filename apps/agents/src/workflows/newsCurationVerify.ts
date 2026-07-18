/**
 * News-digest intro verification — the fact-fidelity guard on the one free-text
 * claim in the daily news_curation email.
 *
 * After Charlie drafts the two-sentence intro (executeRoutine.news_curation_summary),
 * this step hands the draft plus each story's key facts to the internal
 * newsVerifier agent and gets back either a pass, a faithful rewrite, or a
 * verdict that the intro can't be salvaged. Charlie is primed on BTS's
 * corporate-treasury audience and works from a truncated story summary, so it
 * can attach a corporate/CFO framing to a story that doesn't support it (e.g. an
 * individuals-and-sole-traders tax change); this guard catches that before the
 * digest reaches the team.
 *
 * Best-effort throughout: an empty draft or any verifier error returns the draft
 * unchanged (status 'skipped') so a hiccup never blanks the digest. Only a clear
 * "unfaithful, and unfixable" verdict swaps in the caller's neutral fallback.
 */

import { z } from 'zod';
import { newsVerifier } from '../agents/newsVerifier/index.js';
import { stepRequestContext } from '../config/model.js';
import { coerceToSchema } from './newsletter/coerce.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('news-curation');

// Mirror the 420-char ceiling the mood summary itself is bound by (curationMoodSchema).
const MAX_SUMMARY_CHARS = 420;

const verificationSchema = z.object({
  faithful: z
    .boolean()
    .describe('true only if every claim in the intro is supported by the story facts.'),
  corrected_summary: z
    .string()
    .max(MAX_SUMMARY_CHARS)
    .nullable()
    .describe(
      'When faithful is false, a rewritten one-or-two-sentence intro (max 400 chars, no exclamation marks) that states only what the facts support. null when faithful is true, or when the intro cannot be rewritten into something both specific and faithful.',
    ),
});

/** One curated story, reduced to the facts the verifier checks the intro against. */
export interface VerifyStory {
  title: string;
  source_name: string;
  /** Extracted key points — the main claims, numbers, names, dates. May be empty (e.g. podcasts). */
  key_points: string[];
  /** The stored summary, as a fallback when key_points are thin. */
  summary: string;
}

export interface MoodVerification {
  /** The summary the caller should actually use. */
  summary: string;
  /**
   * - `ok`       draft was faithful — summary is the draft unchanged.
   * - `revised`  draft had an unsupported claim — summary is the verifier's rewrite.
   * - `unverified` draft was unfaithful and unfixable — summary is the neutral fallback.
   * - `skipped`  empty draft or verifier error — summary is the draft unchanged (guard bypassed).
   */
  status: 'ok' | 'revised' | 'unverified' | 'skipped';
}

/** Renders one story's facts for the verifier prompt. */
function storyBlock(story: VerifyStory, i: number): string {
  const facts = story.key_points.length
    ? story.key_points.map((p) => `   - ${p}`).join('\n')
    : `   - ${story.summary.slice(0, 400)}`;
  return `${i + 1}. ${story.title} (${story.source_name})\n${facts}`;
}

/** Builds the verifier's user prompt. Pure and exported so the shape is testable. */
export function buildVerifyPrompt(draft: string, stories: VerifyStory[]): string {
  return `Drafted intro to verify:
"""
${draft}
"""

Story facts:
${stories.map(storyBlock).join('\n\n')}

Check the intro against these facts and respond via the schema.`;
}

/**
 * Verify the drafted digest intro against the curated stories' facts.
 *
 * Returns the summary the caller should use plus a status. Best-effort: an empty
 * draft or any error returns the draft unchanged so verification can never fail
 * the routine. `neutralFallback` is used only when the intro is judged unfaithful
 * and cannot be rewritten.
 */
export async function verifyMoodSummary(input: {
  draft: string;
  stories: VerifyStory[];
  neutralFallback: string;
}): Promise<MoodVerification> {
  const draft = input.draft.trim();
  if (!draft || input.stories.length === 0) {
    return { summary: input.draft, status: 'skipped' };
  }

  try {
    const resp = await newsVerifier.generate(
      [{ role: 'user', content: buildVerifyPrompt(draft, input.stories) }],
      {
        requestContext: stepRequestContext('executeRoutine.news_curation_verify'),
        structuredOutput: {
          schema: verificationSchema,
          errorStrategy: 'fallback',
          fallbackValue: { faithful: true, corrected_summary: null },
        },
      },
    );
    const verdict = coerceToSchema(verificationSchema, resp.object ?? { faithful: true, corrected_summary: null });

    if (verdict.faithful) {
      return { summary: input.draft, status: 'ok' };
    }

    const corrected = verdict.corrected_summary?.trim();
    if (corrected) {
      return { summary: corrected, status: 'revised' };
    }

    // Unfaithful and unfixable — don't ship the draft; fall back to a neutral line.
    return { summary: input.neutralFallback, status: 'unverified' };
  } catch (err) {
    log.warn({ err }, 'intro verification failed — keeping draft');
    return { summary: input.draft, status: 'skipped' };
  }
}
