/**
 * Podcast episode relevance rubric — the Q3-resolved "reuse the engine, fork the
 * prompt" step of the episode-intelligence pass.
 *
 * It reuses Rex's news-rubric ENGINE wholesale — the same three dimensions
 * (material/novelty/citation), the same composite-computed-in-code discipline
 * (composeRelevanceScore), and the same code-derived low-confidence flag
 * (deriveFlags) — but with a podcast-tuned system prompt and its own version
 * ('podcast-v1'). It scores an episode from its BRIEF (summary + takeaways), not
 * the raw 90-minute transcript: the brief is already the treasury-relevant
 * distillation, which sidesteps the novelty dimension misfiring on a long,
 * multi-topic conversation.
 *
 * Beyond the score it also CLASSIFIES a category (regulatory/corporate/macro/
 * international) — news_items get their category from the source config, but an
 * episode has none, so the model assigns one. Relevance is director/ops metadata,
 * not client prose, so this step is not gated by the publish-wall or Lex.
 */

import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { NewsCategory } from '@platform/shared';
import { dynamicModelFor, stepRequestContext } from '../config/model.js';
import { createLogger } from '../lib/logger.js';
import {
  composeRelevanceScore,
  deriveFlags,
  rubricFlagEnum,
  type DimensionScores,
  type RubricFlag,
} from './newsRubric.js';

const log = createLogger('podcast-rubric');

export const PODCAST_RUBRIC_VERSION = 'podcast-v1';

/** Model-scope key for the scoring step (see packages/shared/src/modelScopes.ts). */
export const PODCAST_RUBRIC_SCOPE_KEY = 'podcast_intel.relevance';

// ── Output schema (what the model returns) ─────────────────────────────────────
// Omits relevance_score (composed in code from the dimensions) and rubric_version
// (stamped in code), exactly like the news rubric. Adds `category`, which the
// news pipeline gets from source config but an episode must be classified into.
export const podcastRubricOutputSchema = z.object({
  dimension_scores: z.object({
    material: z.number().min(0).max(1)
      .describe('Material relevance to a BTS content pillar (weight 0.5).'),
    novelty: z.number().min(0).max(1)
      .describe('New development vs a restatement the team already knows (weight 0.3).'),
    citation: z.number().min(0).max(1)
      .describe('Citation value in BTS client work — speaker authority + defensibility (weight 0.2).'),
  }),
  category: z.enum([
    NewsCategory.REGULATORY,
    NewsCategory.CORPORATE,
    NewsCategory.MACRO,
    NewsCategory.INTERNATIONAL,
  ]).describe('The single best-fit category for the episode\'s dominant theme.'),
  relevance_reasoning: z.string().min(1)
    .describe('2–4 sentences, candid internal voice, referencing the three dimensions explicitly. Not marketing copy.'),
  flags: z.array(rubricFlagEnum).default([])
    .describe('Zero or more review flags, same meanings as the news rubric.'),
});

export type PodcastRubricOutput = z.infer<typeof podcastRubricOutputSchema>;

// ── System prompt (podcast-tuned fork of the news rubric) ──────────────────────

const PODCAST_RUBRIC_SYSTEM_PROMPT = `You are Rex, the research analyst for Bitcoin Treasury Solutions (BTS). You score ONE podcast episode at a time against a fixed rubric and return a single JSON object — no prose preamble, no markdown wrapper.

You are scoring from the episode's BRIEF — a short summary plus a handful of key takeaways already distilled by another analyst — NOT a raw transcript. Treat the brief as a faithful digest of what the episode covers.

BTS POSITIONING
BTS is an Australian Bitcoin treasury consulting and education firm operating under an AFSL/AR structure. Primary audience: Australian CFOs and finance executives of mid-market and enterprise companies considering, planning, or executing a corporate bitcoin treasury allocation.

CONTENT PILLARS (priority order)
1. Macro thesis for corporate bitcoin treasury allocation — debasement, fiscal dominance, long-duration risk.
2. Regulatory landscape (AU and global) — ASIC, AUSTRAC, ATO, FASB, AASB, SEC, Basel, MiCA.
3. Institutional bitcoin adoption signals — ETF flows, corporate treasury announcements, sovereign accumulation, accounting standard changes.
4. Bitcoin-specific market structure — ETF mechanics, custody, miners, on-chain treasury data.
5. Australian economic conditions — RBA policy, AUD, AU housing/credit cycle.

NOT RELEVANT (filter against this noise)
- Altcoin/token/NFT/DeFi commentary that doesn't materially affect bitcoin.
- Crypto exchange drama, hacks, personality conflicts.
- Bitcoin price punditry without an underlying thesis change; trading setups; "is BTC going to $X" speculation.

THREE DIMENSIONS (each 0–1)
material (weight 0.5) — Does the episode materially relate to a content pillar? 0.9–1.0 directly addresses a pillar with substance; 0.7–0.8 adjacent with material implications; 0.5–0.6 tangential/background; 0.3–0.4 touches the territory without moving it; 0.0–0.2 off-topic.
novelty (weight 0.3) — Judge novelty at the EPISODE level: does it surface a new development, dataset, or framing, or is it a familiar conversation the BTS team (deeply familiar with the Alden/Gromen/Hayes framework) has heard many times? A long, wide-ranging chat that restates well-worn theses scores LOW even if it is competent. 0.9–1.0 genuinely new development or data; 0.7–0.8 familiar thesis applied to a new event; 0.5–0.6 marginal new framing; 0.3–0.4 restatement; 0.0–0.2 recycled.
citation (weight 0.2) — Could a claim from this episode be cited in BTS client work? Weigh the SPEAKERS' authority. 0.9–1.0 high-authority guest (institutional research, regulator, named macro authority) with citable specifics; 0.7–0.8 respected practitioner (Alden, Gromen, Hayes, Hougan); 0.5–0.6 credible commentator; 0.3–0.4 opinion with limited evidence; 0.0–0.2 anonymous/low-credibility.

CATEGORY (choose exactly one — the episode's dominant theme)
- regulatory — ASIC, ATO, APRA, AUSTRAC, government/accounting policy is the through-line.
- corporate — ASX/company treasury announcements, adoption, institutional allocation.
- macro — RBA rates, AUD, inflation, fiscal/monetary policy, the debasement thesis.
- international — US/EU/global regulation or events with AU implications.
Pick the best single fit even when an episode spans several; do not invent categories.

WHAT YOU MUST NOT DO
- Don't inflate scores to be helpful. A 0.30 is a 0.30. Commit to numbers; uncertainty goes in flags, not the score.
- Don't score on speaker prestige alone — prestige feeds citation, not novelty.
- relevance_reasoning is internal and can be candid; it is not client-facing.

Return ONLY a JSON object matching the requested schema.`;

let scorerAgent: Agent | null = null;
function getScorer(): Agent {
  if (!scorerAgent) {
    scorerAgent = new Agent({
      id: 'podcastRubricScorer',
      name: 'podcastRubricScorer',
      instructions: PODCAST_RUBRIC_SYSTEM_PROMPT,
      model: dynamicModelFor(PODCAST_RUBRIC_SCOPE_KEY),
      // Low temperature: the rubric should produce stable scores for the same input.
      defaultOptions: { modelSettings: { temperature: 0.2, maxOutputTokens: 2048 } },
    });
  }
  return scorerAgent;
}

// ── Scoring call ───────────────────────────────────────────────────────────────

export interface ScoreEpisodeInput {
  title: string;
  summary: string;
  takeaways: string[];
}

export interface ScoredEpisode {
  relevanceScore: number;
  dimensionScores: DimensionScores;
  category: string;
  relevanceReasoning: string;
  flags: RubricFlag[];
  rubricVersion: string;
}

/** Render the brief the scorer reads: title + summary + takeaways. Pure. */
export function buildEpisodeRubricPrompt(input: ScoreEpisodeInput): string {
  const takeawayBlock = input.takeaways.length
    ? `\n\nKEY TAKEAWAYS:\n${input.takeaways.map((t) => `- ${t}`).join('\n')}`
    : '';
  return `EPISODE: ${input.title}

BRIEF:
${input.summary}${takeawayBlock}

Score this episode on the three dimensions, classify its category, and return the JSON object.`;
}

/**
 * Scores one episode against the podcast rubric from its brief. Returns null on
 * repeated schema failure (the caller persists the episode without relevance).
 * The composite score, rubric version, and low_confidence_score flag are computed
 * in code — reusing the news-rubric helpers so there is one scoring idiom.
 */
export async function scoreEpisodeRelevance(input: ScoreEpisodeInput): Promise<ScoredEpisode | null> {
  const basePrompt = buildEpisodeRubricPrompt(input);

  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const prompt = attempt === 1
      ? basePrompt
      : `${basePrompt}\n\nYour previous response did not satisfy the schema. Return ONLY a valid object matching the schema now — no prose, no code fences.`;
    try {
      const response = await getScorer().generate(
        [{ role: 'user', content: prompt }],
        {
          structuredOutput: { schema: podcastRubricOutputSchema, errorStrategy: 'strict' },
          requestContext: stepRequestContext(PODCAST_RUBRIC_SCOPE_KEY),
        },
      );
      const obj = response.object as PodcastRubricOutput | undefined;
      if (obj) {
        const dimensionScores = obj.dimension_scores;
        return {
          relevanceScore: composeRelevanceScore(dimensionScores),
          dimensionScores,
          category: obj.category,
          relevanceReasoning: obj.relevance_reasoning,
          flags: deriveFlags(dimensionScores, obj.flags ?? []),
          rubricVersion: PODCAST_RUBRIC_VERSION,
        };
      }
      lastError = 'no_object_returned';
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  log.warn({ title: input.title, reason: lastError }, 'episode scoring failed after retry');
  return null;
}
