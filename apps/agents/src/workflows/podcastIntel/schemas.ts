import { z } from 'zod';

// Episode intelligence — Phase 1 (summary only). The narration step returns just
// a short prose brief; takeaways, chapters and entities are later phases.
export const summaryDraftSchema = z.object({
  summary: z.string(),
});

export type SummaryDraft = z.infer<typeof summaryDraftSchema>;
