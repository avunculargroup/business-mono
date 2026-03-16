import { createTool } from '@mastra/core';
import { z } from 'zod';
import OpenAI from 'openai';
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '@platform/shared';

const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });

export const generateEmbedding = createTool({
  id: 'generate_embedding',
  description: 'Generate a vector embedding for a piece of text using OpenAI text-embedding-3-small',
  inputSchema: z.object({
    text: z.string().describe('Text to embed'),
  }),
  execute: async ({ context }) => {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: context.text,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    return { embedding: response.data[0]?.embedding ?? [] };
  },
});
