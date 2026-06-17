/**
 * News metadata extraction.
 *
 * The structured-metadata step shared by every news ingestion path: given a
 * title + body, classify the article and pull a summary, key points, topic
 * tags, and the AU/Bitcoin relevance booleans. Distinct from the Rex relevance
 * rubric (newsRubric.ts) — this produces the structural news_items fields
 * (category, key_points, ...); the rubric produces the score and curator notes.
 *
 * Extracted from executeRoutineWorkflow so the RSS scan, the email research
 * listener, and unit tests can all reuse it without loading the whole workflow.
 */

import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import type { NewsCategory } from '@platform/shared';
import { dynamicModelFor, stepRequestContext } from '../config/model.js';

export const newsExtractionSchema = z.object({
  category: z.enum(['regulatory', 'corporate', 'macro', 'international'])
    .describe('The single best-fit category: "regulatory" (ASIC/ATO/APRA/government policy), "corporate" (ASX/company treasury announcements), "macro" (RBA rates, AUD, inflation), or "international" (US/EU/global developments with AU implications).'),
  summary: z.string().min(40).max(500)
    .describe('A neutral 2–3 sentence summary of the article. Use capital B for the Bitcoin protocol/network and lowercase b for the currency unit.'),
  key_points: z.array(z.string()).min(2).max(7)
    .describe('2–7 short factual bullet points capturing the main claims, numbers, names, and dates from the article. No marketing language.'),
  topic_tags: z.array(z.string()).min(2).max(8)
    .describe('2–8 lowercase, hyphenated topic tags. Examples: "etf", "rba", "asx-listed", "treasury-strategy", "mining", "regulation".'),
  australian_relevance: z.boolean()
    .describe('true only if the article is about Australia, Australian entities, or has clear direct implications for Australian regulation, markets, or businesses.'),
  bitcoin_relevance: z.boolean()
    .describe('true if the article meaningfully discusses Bitcoin, cryptocurrency, blockchain, digital assets, treasury strategy, or directly relevant macro/regulatory context. false for unrelated content (sports, entertainment, unrelated politics, etc.) even if a Bitcoin keyword appears in passing.'),
});

export type NewsExtraction = z.infer<typeof newsExtractionSchema>;

let newsExtractorAgent: Agent | null = null;
function getNewsExtractor(): Agent {
  if (!newsExtractorAgent) {
    newsExtractorAgent = new Agent({
      id: 'newsExtractor',
      name: 'newsExtractor',
      instructions:
        'You extract structured metadata from news articles for a Bitcoin treasury research database. ' +
        'Be neutral and factual. Capital B = the Bitcoin protocol/network; lowercase b = the currency unit. ' +
        'Avoid marketing language. Topic tags must be lowercase and hyphenated. ' +
        'Set bitcoin_relevance=false for any article that does not meaningfully touch Bitcoin, crypto, blockchain, digital assets, treasury strategy, or directly relevant macro/regulatory context — even if the article was returned by a Bitcoin-themed search query. ' +
        'Always return data shaped exactly to the requested schema — never refuse, never wrap output in prose or code fences.',
      model: dynamicModelFor('executeRoutine.news_extractor'),
      defaultOptions: { modelSettings: { maxOutputTokens: 8192 } },
    });
  }
  return newsExtractorAgent;
}

export async function extractNewsMetadata(input: {
  title: string;
  source: string;
  // When provided, a category hint the caller already knows (keyword routine).
  // When omitted (source scan), the extractor classifies the article itself.
  category?: NewsCategory;
  content: string;
}): Promise<{
  data: NewsExtraction | null;
  reason: string | null;
}> {
  const categoryLine = input.category
    ? `Category hint: ${input.category}\n`
    : `Classify this article into one of: regulatory, corporate, macro, international.\n`;
  const basePrompt =
    categoryLine +
    `Title: ${input.title}\n` +
    `Source: ${input.source}\n\n` +
    `Article:\n${input.content}\n\n` +
    `Extract: category (best-fit of the four values), summary (2–3 sentences, 40–500 chars), ` +
    `key_points (2–7 factual bullets), ` +
    `topic_tags (2–8 lowercase hyphenated tags), australian_relevance (boolean), ` +
    `bitcoin_relevance (boolean — be honest; false if the article is unrelated even if a Bitcoin keyword appears in passing).`;

  // Two attempts max via Mastra structured output (JSON mode + schema-checked).
  // 'strict' throws on validation failure; we catch and retry once with a nudge.
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const prompt = attempt === 1
      ? basePrompt
      : `${basePrompt}\n\nYour previous response did not satisfy the schema. ` +
        `Return ONLY a valid object matching the schema now — no prose, no code fences.`;

    try {
      const response = await getNewsExtractor().generate(
        [{ role: 'user', content: prompt }],
        {
          structuredOutput: {
            schema: newsExtractionSchema,
            errorStrategy: 'strict',
          },
          requestContext: stepRequestContext('executeRoutine.news_extractor'),
        },
      );
      const obj = response.object as NewsExtraction | undefined;
      if (obj) return { data: obj, reason: null };
      lastError = 'no_object_returned';
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  console.warn('[news-ingest] extraction failed after retry', {
    title: input.title,
    reason: lastError,
  });
  return { data: null, reason: lastError?.slice(0, 200) ?? 'unknown' };
}
