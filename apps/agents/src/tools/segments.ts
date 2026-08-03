/**
 * search_segments — one retrieval surface over report pages and podcast
 * transcript moments.
 *
 * Shared rather than living in one agent's tools.ts because two agents need it
 * for different reasons: Rex retrieves to answer, Charlie retrieves to draft.
 * Charlie is the reason `redistribution` is carried all the way to the tool
 * output and stated in the description — the failure mode being prevented is
 * three paragraphs of a publisher's prose appearing in a LinkedIn post, which is
 * a copyright problem before it is a compliance one and a compliance problem
 * soon after.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import OpenAI from 'openai';
import { segmentSearch } from '@platform/db';
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '@platform/shared';

/**
 * What a retrieved passage may be used for, spelled out rather than left as an
 * enum value the model has to guess the meaning of.
 */
const USAGE_NOTES: Record<string, string> = {
  internal_only:
    'INTERNAL ONLY — do not quote, paraphrase closely, or reproduce this passage in any external content. Use it to inform your understanding only.',
  quotable:
    'QUOTABLE — short quotations are permitted with attribution to the publisher and report title.',
  client_shareable:
    'CLIENT SHAREABLE — may be quoted with attribution and included in client-facing material.',
};

export const searchSegments = createTool({
  id: 'search_segments',
  description:
    'Search ingested research reports (PDF/HTML) and podcast transcripts by meaning, in one ranked list. ' +
    'Use for anything a publisher wrote down — institutional research, quarterly reports, regulatory papers — as well as spoken-word content. ' +
    'Every result carries a `usage` note: passages marked INTERNAL ONLY must never be quoted or closely paraphrased in external content. ' +
    'Cite a report passage as "Report title, p. N" and a transcript passage as "Episode title at MM:SS", using the `locator`.',
  inputSchema: z.object({
    query: z.string().describe('Natural language query or topic to search for'),
    source_types: z
      .array(z.enum(['report', 'transcript']))
      .optional()
      .describe('Limit to one corpus. Omit to search both.'),
    limit: z.number().default(10).describe('Maximum passages to return'),
  }),
  execute: async (context) => {
    const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
    const embRes = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: context.query,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    const embedding = embRes.data[0]?.embedding ?? [];

    const rows = await segmentSearch(embedding, {
      sourceTypes: context.source_types,
      count: context.limit ?? 10,
    });

    return {
      count: rows.length,
      results: rows.map((r) => ({
        source_type: r.source_type,
        parent_id: r.parent_id,
        parent_title: r.parent_title,
        locator: r.locator,
        content: r.content,
        redistribution: r.redistribution,
        // A restriction the model has to look up is a restriction it will get
        // wrong. Spelled out on every row instead.
        usage: r.redistribution ? USAGE_NOTES[r.redistribution] ?? null : null,
        similarity: r.similarity,
      })),
    };
  },
});
