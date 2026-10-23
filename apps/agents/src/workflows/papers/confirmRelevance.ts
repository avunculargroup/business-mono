// ============================================================
// Rex confirms the relevance tier — the one judgement in paperResolve
// ============================================================
// The deterministic pass (classify.ts) bands every work; Rex reads the title
// and abstract of everything except a clear exclude and returns a structured
// verdict. Distinguishing "bitcoin as the subject" from "bitcoin as one series
// among thirty" needs reading, which is the only reason an agent is here.
// A failed or malformed answer is not a dead run: the band's tier stands and
// relevance_basis records that Rex did not confirm it.
// Spec: docs/features/client-app/library-papers-spec.md#agent-integration

import { z } from 'zod';
import { rex } from '../../agents/researcher/index.js';
import { stepRequestContext } from '../../config/model.js';
import { createLogger } from '../../lib/logger.js';
import type { RelevanceScores } from './classify.js';
import type { RelevanceTier } from './types.js';

const log = createLogger('paper-relevance');

/** Model-scope key (packages/shared/src/modelScopes.ts). */
export const CONFIRM_RELEVANCE_SCOPE = 'paperResolve.confirm_relevance';

// Controlled vocabulary for papers.topics. Rex picks from it; it never coins one.
export const PAPER_TOPICS = [
  'accounting', 'tax', 'regulation', 'law', 'custody', 'security', 'monetary-economics',
  'price-dynamics', 'volatility', 'hedging', 'portfolio', 'market-structure', 'etfs',
  'adoption', 'corporate-treasury', 'energy', 'mining', 'protocol', 'privacy', 'payments',
  'australia', 'other',
] as const;

export const relevanceVerdictSchema = z.object({
  tier: z.enum(['core', 'substantial', 'peripheral', 'excluded']),
  bitcoin_role: z.string().min(1).max(300)
    .describe('One sentence: what role bitcoin plays in this paper.'),
  topics: z.array(z.enum(PAPER_TOPICS)).min(1).max(4),
  confidence: z.number().min(0).max(1),
  reasons: z.string().min(1).max(600)
    .describe('Two sentences at most, citing what in the title or abstract decided the tier.'),
});
export type RelevanceVerdict = z.infer<typeof relevanceVerdictSchema>;

export interface ConfirmInput {
  title: string;
  abstract: string | null;
  venue: string | null;
  workType: string | null;
  scores: RelevanceScores;
}

export function buildPrompt(input: ConfirmInput): string {
  return `Classify how central bitcoin is to one research paper, for a register of peer-reviewed bitcoin research read by Australian CFOs and SMSF trustees.

TIERS
- core: bitcoin is the object of study.
- substantial: bitcoin is one of a few compared subjects and has its own findings; OR the paper covers cryptocurrencies or crypto-assets generally and its findings apply directly to holding or using bitcoin (accounting, tax, regulation, custody, security).
- peripheral: bitcoin is one series among many, or is mentioned in passing.
- excluded: bitcoin is not actually a subject (a false positive, or altcoin-only, or blockchain with no bitcoin content).

EXAMPLES (from the register's own tier table)
- core: accounting for bitcoin holdings under IFRS.
- substantial: bitcoin vs gold as a hedge across crises (two subjects, each with its own findings); IAS 38 treatment of cryptocurrencies.
- peripheral: a machine-learning forecasting benchmark using 30 assets, bitcoin among them.

RULES
- Judge from the title and abstract only. Do not use outside knowledge of the paper or its authors.
- Do not judge quality, method or conclusions. Only how central bitcoin is.
- If there is no abstract, decide from the title and say so in reasons.
- Pick topics only from the allowed list.

Deterministic first pass (term counts): bitcoin in title ${input.scores.titleBitcoin}, in abstract ${input.scores.abstractBitcoin}; crypto-generic in title ${input.scores.titleCrypto}, in abstract ${input.scores.abstractCrypto}; other named assets ${input.scores.otherAssets}; band ${input.scores.band}.

Title: ${input.title}
Venue: ${input.venue ?? 'unknown'}
Type: ${input.workType ?? 'unknown'}
Abstract: ${input.abstract ? input.abstract.slice(0, 6000) : '(none available)'}`;
}

/**
 * Rex's verdict, or null when the answer could not be used. A malformed answer
 * is asked for once more, as newsRubric does; an error is not retried.
 */
export async function confirmRelevance(input: ConfirmInput): Promise<RelevanceVerdict | null> {
  const prompt = buildPrompt(input);
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await rex.generate([{
        role: 'user',
        content: attempt === 1
          ? prompt
          : `${prompt}\n\nYour previous answer did not match the schema. Return only the object, with topics from the allowed list and reasons under 600 characters.`,
      }], {
        requestContext: stepRequestContext(CONFIRM_RELEVANCE_SCOPE),
        structuredOutput: { schema: relevanceVerdictSchema, errorStrategy: 'warn' },
      });
      // 'warn' continues past a schema failure, so the object is checked here.
      const parsed = relevanceVerdictSchema.safeParse(response.object);
      if (parsed.success) return parsed.data;
      log.warn({ title: input.title, attempt }, 'relevance verdict did not match the schema');
    } catch (err) {
      log.error({ err, title: input.title }, 'relevance confirmation failed');
      return null;
    }
  }
  return null;
}

export interface RelevanceDecision {
  tier: RelevanceTier;
  topics: string[];
  /** Stored as papers.relevance_basis. */
  basis: Record<string, unknown>;
}

/** Combines the deterministic band and Rex's verdict into what gets stored. */
export function decideRelevance(
  scores: RelevanceScores,
  fallbackTier: RelevanceTier,
  verdict: RelevanceVerdict | null,
  skipped: boolean,
): RelevanceDecision {
  return {
    tier: verdict?.tier ?? fallbackTier,
    topics: verdict ? [...new Set(verdict.topics)] : [],
    basis: {
      deterministic: scores,
      rex: verdict
        ? { tier: verdict.tier, bitcoin_role: verdict.bitcoin_role, confidence: verdict.confidence, reasons: verdict.reasons }
        : null,
      rex_status: skipped ? 'skipped_clear_exclude' : verdict ? 'confirmed' : 'unavailable',
    },
  };
}
