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

// One chapter: a short title and the second the segment begins. start_seconds is
// the model's proposal; the workflow snaps it to a real transcript-segment start
// and drops chapters with no anchor (a chapter without a jump target is useless).
export const chapterSchema = z.object({
  title: z.string(),
  start_seconds: z.number().nullable(),
});
export type Chapter = z.infer<typeof chapterSchema>;

// Episode intelligence — the narration step returns a short prose brief, key
// takeaways (Phase 2), chapters (Phase 3), and topic tags (which place the
// episode among related news/episodes). Entities are extracted separately (a
// deterministic gazetteer, not the model). All arrays default to [] so the
// narration fallback value ({ summary: '' }) still parses cleanly.
export const summaryDraftSchema = z.object({
  summary: z.string(),
  takeaways: z.array(takeawaySchema).default([]),
  chapters: z.array(chapterSchema).default([]),
  topic_tags: z.array(z.string()).default([]),
});

export type SummaryDraft = z.infer<typeof summaryDraftSchema>;
