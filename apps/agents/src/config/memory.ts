import { Memory } from '@mastra/memory';
import { PgVector } from '@mastra/pg';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
import { EMBEDDING_MODEL } from '@platform/shared';
import { z } from 'zod';
import { getModelConfig } from './model.js';
import { getResolvedMastraDbUrl } from '../lib/resolveDbUrl.js';

const workingMemorySchema = z.object({
  directorName: z.string().describe('Name of the director'),
  preferences: z.string().describe('Communication preferences, formatting, timezone'),
  activeProjects: z.string().describe('Currently active projects and their status'),
  recentDecisions: z.string().describe('Key decisions made in recent conversations'),
  pendingItems: z.string().describe('Items awaiting director input or approval'),
  notes: z.string().describe('Other persistent context Simon should remember'),
});

const resolvedDbUrl = await getResolvedMastraDbUrl();

/**
 * Simon's memory configuration.
 *
 * - `lastMessages: 40` — recent conversation history passed to the model.
 * - `semanticRecall` — pgvector-backed similarity search over older messages,
 *   scoped per resource (director). Lets Simon recall context from threads
 *   beyond the 40-message window without bloating the prompt.
 * - `workingMemory` — persistent Zod-schema-based director context, scoped per
 *   resource. Survives restarts and is shared across all threads for the same
 *   director.
 * - `observationalMemory` — Observer/Reflector agents compress long-running
 *   conversations into summaries once they exceed the configured message
 *   budget, scoped to the resource so observations persist across threads.
 *
 * The 80k-token output budget is enforced by `TokenLimiterProcessor` on the
 * Simon Agent (see `agents/simon/index.ts`). Memory's own `processors` field
 * is deprecated in core 1.x.
 */
export const memory = new Memory({
  vector: new PgVector({ id: 'mastra-vector', connectionString: resolvedDbUrl }),
  embedder: new ModelRouterEmbeddingModel(`openai/${EMBEDDING_MODEL}`),
  options: {
    lastMessages: 40,
    semanticRecall: {
      topK: 5,
      messageRange: { before: 2, after: 2 },
      scope: 'resource',
    },
    workingMemory: {
      enabled: true,
      schema: workingMemorySchema,
      scope: 'resource',
    },
    observationalMemory: {
      model: getModelConfig(),
      scope: 'resource',
      observation: {
        messageTokens: 30_000,
      },
      reflection: {
        observationTokens: 40_000,
      },
    },
  },
});
