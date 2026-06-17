/**
 * Rex relevance rubric — the fuzzy-reasoning step of news ingestion.
 *
 * When a normalised item arrives (from any ingestion path), Rex reads the body
 * and returns a structured judgement: three dimension scores, a BTS-voice
 * summary, suggested curator notes, topics, and review flags. The composite
 * relevance score and the rubric version are computed deterministically in
 * code (not trusted to the model) so the threshold logic stays stable.
 *
 * Source of truth for the rubric content: docs/news-source-email-spec.md
 * ("Rex Scoring Rubric"). Bump RUBRIC_VERSION when the rubric changes — new
 * items only; re-scoring history is a deliberate operation.
 */

import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { dynamicModelFor, stepRequestContext } from '../config/model.js';

export const RUBRIC_VERSION = 'v1';

/** Model-scope key for the scoring step (see packages/shared/src/modelScopes.ts). */
export const RUBRIC_SCOPE_KEY = 'executeRoutine.news_rubric_score';

// ── Output schema (what the model returns) ─────────────────────────────────────
// Deliberately omits relevance_score (composed in code from the dimensions) and
// rubric_version (stamped in code). low_confidence_score is also derived in code
// from dimension divergence, so it is not in the model's flag enum.

export const rubricFlagEnum = z.enum([
  'compliance_implication',
  'factual_uncertainty',
  'tone_concern',
  'breaking_signal',
]);
export type RubricLlmFlag = z.infer<typeof rubricFlagEnum>;
export type RubricFlag = RubricLlmFlag | 'low_confidence_score';

export const rubricOutputSchema = z.object({
  dimension_scores: z.object({
    material: z.number().min(0).max(1)
      .describe('Material relevance to a BTS content pillar (weight 0.5).'),
    novelty: z.number().min(0).max(1)
      .describe('Is this a new development vs a restatement the team already knows (weight 0.3).'),
    citation: z.number().min(0).max(1)
      .describe('Citation value in BTS client work — source authority + defensibility (weight 0.2).'),
  }),
  relevance_reasoning: z.string().min(1)
    .describe('2–4 sentences, candid internal voice, referencing the three dimensions explicitly. Not marketing copy.'),
  summary: z.string().min(1)
    .describe('2–3 sentences, ≤60 words, CFO-audience tone. Rex\'s synthesis for a BTS reader — not a paraphrase of the author\'s voice. No quotes, no hype, no exclamation marks.'),
  topics: z.array(z.string()).min(1).max(5)
    .describe('1–5 short kebab-case topic tags. Reuse existing topics where possible for clustering.'),
  suggested_curator_notes: z.string().min(1)
    .describe('Why this matters for BTS, 1–3 sentences: who would use it, in what context, why now.'),
  flags: z.array(rubricFlagEnum).default([])
    .describe('Zero or more review flags. compliance_implication: discusses ASIC/AUSTRAC/ATO/AFSL/AR conditions affecting BTS. factual_uncertainty: a specific claim may not be correct/current. tone_concern: language that would not translate into BTS voice. breaking_signal: a genuinely new development that may move BTS positioning today (use sparingly — ~5% of items).'),
});

export type RubricOutput = z.infer<typeof rubricOutputSchema>;

export interface DimensionScores {
  material: number;
  novelty: number;
  citation: number;
}

// ── Pure scoring helpers ───────────────────────────────────────────────────────

/** Composite relevance: material×0.5 + novelty×0.3 + citation×0.2, rounded to 2dp. */
export function composeRelevanceScore(d: DimensionScores): number {
  const raw = d.material * 0.5 + d.novelty * 0.3 + d.citation * 0.2;
  return Math.round(raw * 100) / 100;
}

/**
 * Final flag set: the model's semantic flags plus a code-derived
 * `low_confidence_score` when the three dimensions diverge widely (range > 0.5).
 * Deduped, order preserved.
 */
export function deriveFlags(d: DimensionScores, llmFlags: readonly RubricLlmFlag[]): RubricFlag[] {
  const flags: RubricFlag[] = [...new Set(llmFlags)];
  const range = Math.max(d.material, d.novelty, d.citation) - Math.min(d.material, d.novelty, d.citation);
  if (range > 0.5) flags.push('low_confidence_score');
  return flags;
}

// ── System prompt ──────────────────────────────────────────────────────────────

const RUBRIC_SYSTEM_PROMPT = `You are Rex, the research analyst for Bitcoin Treasury Solutions (BTS). You score one inbound research item at a time against a fixed rubric and return a single JSON object — no prose preamble, no markdown wrapper.

BTS POSITIONING
BTS is an Australian Bitcoin treasury consulting and education firm operating under an AFSL/AR structure. Primary audience: Australian CFOs and finance executives of mid-market and enterprise companies considering, planning, or executing a corporate bitcoin treasury allocation. The voice of all client-facing work is plain, confident, advisory — a private wealth manager, not a crypto evangelist.

CONTENT PILLARS (priority order)
1. Macro thesis for corporate bitcoin treasury allocation — debasement, fiscal dominance, long-duration risk (the Gromen/Alden framing).
2. Regulatory landscape (AU and global) — ASIC, AUSTRAC, ATO, FASB, AASB, SEC, Basel, MiCA — anything changing what an AU CFO can legally or operationally do.
3. Institutional bitcoin adoption signals — ETF flows, corporate treasury announcements, sovereign accumulation, pension allocations, accounting standard changes.
4. Bitcoin-specific market structure — ETF mechanics, custody, miners, on-chain treasury data.
5. Australian economic conditions — RBA policy, AUD, AU housing/credit cycle (the AU CFO decision context).

NOT RELEVANT (filter against this noise)
- Altcoin/token/NFT/DeFi commentary that doesn't materially affect bitcoin.
- Crypto exchange drama, hacks, personality conflicts.
- Bitcoin price punditry without an underlying thesis change.
- Trading setups, technical analysis, "is BTC going to $X" speculation.
- US political commentary not directly about monetary, fiscal, or regulatory policy.
- General macro with no transmission mechanism to bitcoin or AU CFO decisions.

THREE DIMENSIONS (each 0–1)
material (weight 0.5) — Does it materially relate to a content pillar? 0.9–1.0 directly addresses a pillar with substantive new information; 0.7–0.8 adjacent with material implications; 0.5–0.6 tangential/background; 0.3–0.4 touches the territory without moving it; 0.0–0.2 off-topic/altcoin/pure speculation.
novelty (weight 0.3) — Is this a new development, or a restatement the BTS team (deeply familiar with the Alden/Gromen/Hayes framework) already knows? 0.9–1.0 genuinely new development; 0.7–0.8 familiar thesis applied to a new event/dataset; 0.5–0.6 marginal new framing; 0.3–0.4 pure restatement; 0.0–0.2 recycled/aggregator content. If the supplied RECENT SIMILAR ITEMS already cover this, novelty is low.
citation (weight 0.2) — Could it be cited in BTS client work? 0.9–1.0 high-authority source (Fidelity, BlackRock, RBA, ASIC, IMF, BIS) with citable data; 0.7–0.8 respected practitioner (Alden, Gromen, Hayes, Hougan); 0.5–0.6 credible commentator, supporting context only; 0.3–0.4 opinion with limited evidence; 0.0–0.2 anonymous/low-credibility/pseudonymous.

CALIBRATION ANCHORS
- Gromen Tree Rings on Treasury issuance: material 0.95, novelty 0.70, citation 0.80.
- Cointelegraph "Bitcoin Could Hit $250K by Year End, Analyst Says": material 0.20, novelty 0.10, citation 0.10.
- RBA Statement on Monetary Policy: material 0.75, novelty 0.80, citation 0.95.
- Bitwise CIO weekly market commentary (ETF flow data): material 0.70, novelty 0.65, citation 0.85.
- Anonymous Substack "Why Banks Hate Bitcoin": material 0.45, novelty 0.20, citation 0.10.

EDITORIAL CONSTRAINTS (apply to summary and suggested_curator_notes; NOT to relevance_reasoning, which is internal and can be candid)
- Capital B = the Bitcoin network/protocol; lowercase b = the currency/unit.
- No hype language ("moon", "game-changing"). No exclamation marks. Plain, declarative CFO-audience tone; explain jargon.

WHAT YOU MUST NOT DO
- Don't score from the title alone — read the body.
- Don't inflate scores to be helpful. A 0.30 is a 0.30.
- Don't hedge: commit to numbers; uncertainty goes in flags, not the score.
- Don't score on prestige alone — prestige feeds citation, not novelty.
- Don't apply different rubrics by source type — a podcast and a newsletter are scored identically.
- Don't write summaries in the source's voice, and don't quote the source — paraphrase.

Return ONLY a JSON object matching the requested schema.`;

let scorerAgent: Agent | null = null;
function getScorer(): Agent {
  if (!scorerAgent) {
    scorerAgent = new Agent({
      id: 'newsRubricScorer',
      name: 'newsRubricScorer',
      instructions: RUBRIC_SYSTEM_PROMPT,
      model: dynamicModelFor(RUBRIC_SCOPE_KEY),
      // Low temperature: the rubric should produce stable scores for the same input.
      defaultOptions: { modelSettings: { temperature: 0.2, maxOutputTokens: 4096 } },
    });
  }
  return scorerAgent;
}

// ── Scoring call ───────────────────────────────────────────────────────────────

export interface SimilarItem {
  title: string;
  summary: string | null;
  similarity: number;
  published_at: string | null;
}

export interface ScoreNewsItemInput {
  title: string;
  body: string;
  sourceName: string;
  sourceTier: string | null;
  /** Nearest neighbours for the novelty check (computed by the caller). */
  similar: SimilarItem[];
}

export interface ScoredNewsItem {
  relevanceScore: number;
  dimensionScores: DimensionScores;
  relevanceReasoning: string;
  summary: string;
  topics: string[];
  suggestedCuratorNotes: string;
  flags: RubricFlag[];
  needsHumanReview: boolean;
  rubricVersion: string;
}

/**
 * Scores one item against the rubric. Returns null on repeated schema failure
 * (the caller decides how to persist an unscored item). The composite score,
 * rubric version, and low_confidence_score flag are computed in code.
 */
export async function scoreNewsItem(input: ScoreNewsItemInput): Promise<ScoredNewsItem | null> {
  const similarBlock = input.similar.length
    ? input.similar
        .map((s, i) => `${i + 1}. (sim ${s.similarity.toFixed(2)}) ${s.title} — ${s.summary ?? ''}`.trim())
        .join('\n')
    : 'None on file.';

  const basePrompt =
    `Source: ${input.sourceName}${input.sourceTier ? ` (${input.sourceTier})` : ''}\n` +
    `Title: ${input.title}\n\n` +
    `RECENT SIMILAR ITEMS (for the novelty check):\n${similarBlock}\n\n` +
    `ITEM BODY:\n${input.body.slice(0, 12000)}\n\n` +
    `Score this item on the three dimensions and return the JSON object.`;

  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const prompt = attempt === 1
      ? basePrompt
      : `${basePrompt}\n\nYour previous response did not satisfy the schema. Return ONLY a valid object matching the schema now — no prose, no code fences.`;
    try {
      const response = await getScorer().generate(
        [{ role: 'user', content: prompt }],
        {
          structuredOutput: { schema: rubricOutputSchema, errorStrategy: 'strict' },
          requestContext: stepRequestContext(RUBRIC_SCOPE_KEY),
        },
      );
      const obj = response.object as RubricOutput | undefined;
      if (obj) {
        const dimensionScores = obj.dimension_scores;
        const flags = deriveFlags(dimensionScores, obj.flags ?? []);
        return {
          relevanceScore: composeRelevanceScore(dimensionScores),
          dimensionScores,
          relevanceReasoning: obj.relevance_reasoning,
          summary: obj.summary,
          topics: obj.topics,
          suggestedCuratorNotes: obj.suggested_curator_notes,
          flags,
          needsHumanReview: flags.length > 0,
          rubricVersion: RUBRIC_VERSION,
        };
      }
      lastError = 'no_object_returned';
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  console.warn('[news-rubric] scoring failed after retry', { title: input.title, reason: lastError });
  return null;
}
