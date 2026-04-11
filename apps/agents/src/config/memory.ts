import { Memory } from '@mastra/memory';
import { z } from 'zod';

const workingMemorySchema = z.object({
  directorName: z.string().describe('Name of the director'),
  preferences: z.string().describe('Communication preferences, formatting, timezone'),
  activeProjects: z.string().describe('Currently active projects and their status'),
  recentDecisions: z.string().describe('Key decisions made in recent conversations'),
  pendingItems: z.string().describe('Items awaiting director input or approval'),
  notes: z.string().describe('Other persistent context Simon should remember'),
});

/**
 * Simon's memory configuration.
 *
 * - `lastMessages: 40` — recent conversation history passed to the model.
 * - `workingMemory` — persistent Zod-schema-based director context, scoped per resource
 *   (director). Survives restarts and is shared across all threads for the same director.
 * - `observationalMemory` — Observer/Reflector agents compress long-running conversations
 *   into summaries once they exceed the configured message budget, scoped to the resource
 *   so observations persist across threads.
 *
 * The 80k-token output budget is enforced by `TokenLimiterProcessor` on the Simon Agent
 * (see `agents/simon/index.ts`). Memory's own `processors` field is deprecated in core 1.x.
 */
export const memory = new Memory({
  options: {
    lastMessages: 40,
    semanticRecall: false,
    workingMemory: {
      enabled: true,
      schema: workingMemorySchema,
      scope: 'resource',
    },
    observationalMemory: {
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
