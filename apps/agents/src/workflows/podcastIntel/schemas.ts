import { z } from 'zod';

// One key takeaway: a short, treasury-relevant point the episode makes, anchored
// to the moment it is discussed. start_seconds is the model's proposal; the
// workflow snaps it to a real transcript-segment start before persisting (or to
// null when the transcript carries no timestamps).
export const takeawaySchema = z.object({
  text: z.string(),
  start_seconds: z.number().nullable(),
});
export type Takeaway = z.infer<typeof takeawaySchema>;

// Episode intelligence — the narration step returns a short prose brief plus key
// takeaways (Phase 2). Chapters and entities are later phases. takeaways defaults
// to [] so the narration fallback value ({ summary: '' }) still parses cleanly.
export const summaryDraftSchema = z.object({
  summary: z.string(),
  takeaways: z.array(takeawaySchema).default([]),
});

export type SummaryDraft = z.infer<typeof summaryDraftSchema>;
