import { Memory } from '@mastra/memory';
import { TokenLimiter } from '@mastra/memory/processors';
import { z } from 'zod';

const workingMemorySchema = z.object({
  directorName: z.string().describe('Name of the director'),
  preferences: z.string().describe('Communication preferences, formatting, timezone'),
  activeProjects: z.string().describe('Currently active projects and their status'),
  recentDecisions: z.string().describe('Key decisions made in recent conversations'),
  pendingItems: z.string().describe('Items awaiting director input or approval'),
  notes: z.string().describe('Other persistent context Simon should remember'),
});

export const memory = new Memory({
  options: {
    lastMessages: 40,
    semanticRecall: false,
    workingMemory: {
      enabled: true,
      schema: workingMemorySchema,
      scope: 'resource',
    },
    // Observational Memory requires @mastra/core >= 1.x.
    // Enable when @mastra/core is upgraded:
    // observationalMemory: {
    //   enabled: true,
    //   observerThresholdTokens: 30_000,
    //   reflectorThresholdTokens: 40_000,
    //   previousObserverTokens: 4_000,
    // },
  },
  processors: [
    new TokenLimiter({ limit: 80_000 }),
  ],
});
