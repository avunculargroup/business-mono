import { z } from 'zod';

// Zod schemas for the newsletter workflow. The spec's TypeScript types become
// the source of truth here — step input/output schemas and the structuredOutput
// schemas Rex / Charlie / the Editor return are all defined in this one place.

export const timeRangeSchema = z.enum(['week', 'fortnight', 'month']);
export type TimeRange = z.infer<typeof timeRangeSchema>;

// ── Workflow input ─────────────────────────────────────────────────────────
export const newsletterInputSchema = z.object({
  timeRange: timeRangeSchema.default('month'),
  storyCount: z.number().int().min(3).max(8).default(5),
  targetWordCount: z.number().int().min(100).max(800).default(250),
  // Stored routine action_config writes `audience_context: null` when no
  // override is given, so accept null here (not just undefined) — otherwise the
  // routine-launched run fails Zod parse at the startNewsletterRun boundary.
  audienceContext: z.string().nullish(),
  triggerSource: z.enum(['signal', 'schedule', 'web']).default('signal'),
  requestedBy: z.string().optional(),        // team_members.id
  requestedBySignal: z.string().optional(),  // sender E.164 for gate replies
});
export type NewsletterInput = z.infer<typeof newsletterInputSchema>;

// ── Step 1: retrieval ────────────────────────────────────────────────────────
export const retrievedItemSchema = z.object({
  id: z.string(),
  // news_items is the newsletter's primary source; content_items / interactions
  // are supplementary internal context.
  source_table: z.enum(['content_items', 'interactions', 'news_items']),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  body_excerpt: z.string().nullable(),
  // Source URL for news items (null for internal content) so Rex can cite it.
  url: z.string().nullable(),
  similarity_score: z.number(),
  recency_score: z.number(),
  composite_score: z.number(),
  created_at: z.string().nullable(),
});
export type RetrievedItem = z.infer<typeof retrievedItemSchema>;

// ── Step 2: story selection (Rex structuredOutput) ──────────────────────────
export const storyCandidateSchema = z.object({
  story_id: z.string(),
  working_title: z.string(),
  angle: z.string(),
  key_points: z.array(z.string()),
  source_ids: z.array(z.string()),
  relevance_score: z.number(),
  data_completeness: z.number(),
  needs_research: z.boolean(),
  research_queries: z.array(z.string()).optional(),
  rex_rationale: z.string(),
});
export type StoryCandidate = z.infer<typeof storyCandidateSchema>;

export const storyShortlistSchema = z.object({
  candidates: z.array(storyCandidateSchema),
  recommended: z.array(z.string()),
  rex_editorial_note: z.string(),
});
export type StoryShortlist = z.infer<typeof storyShortlistSchema>;

// ── Step 4: research note (Rex structuredOutput) ────────────────────────────
export const researchNoteSchema = z.object({
  story_id: z.string(),
  sources: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      key_excerpt: z.string(),
      retrieved_at: z.string(),
    }),
  ),
  research_summary: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
});
export type ResearchNote = z.infer<typeof researchNoteSchema>;

// ── Step 5: draft (Charlie structuredOutput) ────────────────────────────────
export const storyDraftSchema = z.object({
  story_id: z.string(),
  working_title: z.string(),
  draft_title: z.string(),
  body: z.string(),
  word_count: z.number(),
  key_message: z.string(),
  sources_used: z.array(z.string()),
  charlie_note: z.string(),
});
export type StoryDraft = z.infer<typeof storyDraftSchema>;

export const introOutroSchema = z.object({
  intro: z.string(),
  outro: z.string(),
});

// ── Step 6: editorial review (Editor structuredOutput) ──────────────────────
export const editorialReviewSchema = z.object({
  story_id: z.string(),
  scores: z.object({
    voice_match: z.number(),
    audience_fit: z.number(),
    bitcoin_accuracy: z.number(),
    clarity: z.number(),
    evidence_quality: z.number(),
    length_discipline: z.number(),
  }),
  overall_score: z.number(),
  passes_gate: z.boolean(),
  critique: z.string(),
  revised_draft: z.string().optional(),
  editor_note: z.string(),
});
export type EditorialReview = z.infer<typeof editorialReviewSchema>;

// ── Gate resume payloads ─────────────────────────────────────────────────────
export const gate1ResumeSchema = z.object({
  decision: z.enum(['approve', 'adjust']),
  adjustment: z.string().optional(),
});
export type Gate1Resume = z.infer<typeof gate1ResumeSchema>;

export const gate2ResumeSchema = z.object({
  decision: z.enum(['publish', 'revise', 'hold']),
  storyNumber: z.number().int().optional(),
  instruction: z.string().optional(),
});
export type Gate2Resume = z.infer<typeof gate2ResumeSchema>;

// ── Gate suspend payloads (consumed by the run-result handler) ──────────────
export const gate1SuspendSchema = z.object({
  gate: z.literal('gate1'),
  message: z.string(),
});
export const gate2SuspendSchema = z.object({
  gate: z.literal('gate2'),
  message: z.string(),
  newsletterMarkdown: z.string(),
  held: z.boolean().optional(),
});

// A reviewed story carries the final body chosen for assembly (editor revision
// if the draft failed the gate, otherwise Charlie's draft).
export const reviewedStorySchema = z.object({
  story_id: z.string(),
  title: z.string(),
  body: z.string(),
  word_count: z.number(),
  review: editorialReviewSchema,
});
export type ReviewedStory = z.infer<typeof reviewedStorySchema>;

// ── Workflow output ──────────────────────────────────────────────────────────
// A finished run either persisted a newsletter or short-circuited because there
// were no stories worth running. The no-stories branch never reaches a human
// gate — there's nothing to approve — so it bails with a diagnostic reason.
export const newsletterCompletedSchema = z.object({
  contentItemId: z.string(),
  title: z.string(),
  storyCount: z.number(),
  totalWordCount: z.number(),
  editorialScores: z.record(z.number()),
});
export type NewsletterCompleted = z.infer<typeof newsletterCompletedSchema>;

export const newsletterNoStoriesSchema = z.object({
  noStories: z.literal(true),
  reason: z.string(),
  timeRange: timeRangeSchema,
  candidatesFound: z.number(),
});
export type NewsletterNoStories = z.infer<typeof newsletterNoStoriesSchema>;

export const newsletterOutputSchema = z.union([
  newsletterCompletedSchema,
  newsletterNoStoriesSchema,
]);

// Workflow state. A resumed step re-executes from the top with fresh resumeData,
// so the gate-2 revision loop must persist the working draft here (not in local
// vars) to survive across resume cycles — otherwise a later "publish" would
// save the pre-revision draft.
export const newsletterStateSchema = z.object({
  working: z
    .object({
      reviewed: z.array(reviewedStorySchema),
      markdown: z.string(),
      totalWordCount: z.number(),
      overLengthIds: z.array(z.string()),
    })
    .optional(),
});
