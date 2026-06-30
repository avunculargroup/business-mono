import { z } from 'zod';

// Schemas for the Variant Generation workflow (Step 6 of the Social Campaigns
// build). One run turns a (beat × account) into a single platform-conformant
// content_item variant: resolve context → Charlie → Lex → persist → Gate 3.
// See docs/social-campaign-workflows-flow.md (Workflow 2).

export const platformEnum = z.enum(['linkedin', 'twitter_x']);
export type Platform = z.infer<typeof platformEnum>;

export const variantInputSchema = z.object({
  campaignId: z.string().uuid(),
  beatId: z.string().uuid(),
  socialAccountId: z.string().uuid(),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

// The platform_specs row fields the workflow needs (limits + guidance).
export const platformSpecSchema = z.object({
  platform: platformEnum,
  max_chars: z.number(),
  premium_max_chars: z.number().nullable().optional(),
  max_thread_segments: z.number().nullable().optional(),
  max_images_per_post: z.number().nullable().optional(),
  hashtag_guidance: z.string().nullable().optional(),
});

// id + key of an active compliance_snippets row, so Lex can pick by key and the
// persist step can resolve the key back to a disclaimer_snippet_id.
export const disclaimerRefSchema = z.object({ id: z.string(), key: z.string() });

export const beatSchema = z.object({
  id: z.string(),
  core_message: z.string(),
  title: z.string().nullable().optional(),
  rationale: z.string().nullable().optional(),
  prefer_thread: z.boolean(),
});

// Structured format override extracted from the resolved voice profile.
// `legacy_notes` carries the old free-text format_notes when no structured
// format is set. Null means no format override — use platform defaults.
export const formatConfigSchema = z.object({
  word_count_min: z.number().optional(),
  word_count_max: z.number().optional(),
  register: z.enum(['formal', 'semi-formal', 'conversational', 'casual']).optional(),
  paragraphing: z.enum(['single-block', 'short-paragraphs', 'platform-default']).optional(),
  hashtag_use: z.enum(['none', 'sparingly', 'platform-default']).optional(),
  legacy_notes: z.string().optional(),
}).nullable();
export type FormatConfigCtx = z.infer<typeof formatConfigSchema>;

// The complete context one variant generation needs, assembled by the
// resolve-context step and threaded through the rest of the run.
export const variantContextSchema = z.object({
  input: variantInputSchema,
  platform: platformEnum,
  accountDisplayName: z.string(),
  // Pre-rendered <brand-voice> block (merged profile + retrieved exemplars).
  voiceBlock: z.string(),
  // Structured format override (null = use platform defaults).
  formatConfig: formatConfigSchema.optional(),
  platformSpec: platformSpecSchema,
  // campaigns.strategy JSONB — loose; the prompt builder reads known fields.
  strategy: z.record(z.string(), z.unknown()),
  beat: beatSchema,
  disclaimerSnippets: z.array(disclaimerRefSchema),
});
export type VariantContext = z.infer<typeof variantContextSchema>;

export const threadSegmentDraftSchema = z.object({ body: z.string() });

// Charlie's output: a single post (body) or a thread (ordered segments).
export const charlieVariantSchema = z.object({
  is_thread: z.boolean().default(false),
  title: z.string().default(''),
  // Single post: the full copy. Thread: optional lead/summary line.
  body: z.string().default(''),
  // Thread only: ordered segments (sequence assigned at persist).
  segments: z.array(threadSegmentDraftSchema).default([]),
  charlie_note: z.string().default(''),
});
export type CharlieVariant = z.infer<typeof charlieVariantSchema>;

export const complianceClassificationEnum = z.enum([
  'educational',
  'general_advice',
  'personal_opinion',
]);
export type ComplianceClassification = z.infer<typeof complianceClassificationEnum>;

// Lex's advisory verdict.
export const lexVerdictSchema = z.object({
  classification: complianceClassificationEnum,
  needs_disclaimer: z.boolean().default(false),
  // A compliance_snippets.key, when a disclaimer applies.
  disclaimer_key: z.string().nullable().default(null),
  rationale: z.string().default(''),
});
export type LexVerdict = z.infer<typeof lexVerdictSchema>;

// Gate 3 resume payload (from the variant editor UI).
export const variantGateResumeSchema = z.object({
  decision: z.enum(['approve', 'request_change']),
  // Required for request_change — what to fix on regeneration.
  instruction: z.string().optional(),
  approvedBy: z.string().uuid().optional(),
});
export type VariantGateResume = z.infer<typeof variantGateResumeSchema>;

// What the workflow suspends with at Gate 3 — everything the variant editor
// needs to render the platform-mimic preview, char counter, and Lex chip.
export const variantGateSuspendSchema = z.object({
  gate: z.literal('gate3'),
  contentItemId: z.string(),
  preview: z.object({
    platform: platformEnum,
    accountName: z.string(),
    isThread: z.boolean(),
    title: z.string(),
    body: z.string(),
    segments: z.array(z.string()),
    charCount: z.number(),
    charLimit: z.number(),
    classification: complianceClassificationEnum,
    needsDisclaimer: z.boolean(),
    disclaimerKey: z.string().nullable(),
    rationale: z.string(),
  }),
});

// Per-run state so a regeneration at the gate survives the resume re-entry.
export const variantStateSchema = z.object({
  working: z
    .object({ draft: charlieVariantSchema, verdict: lexVerdictSchema })
    .optional(),
});

// Terminal result. `suspended` is the placeholder returned on the suspend pass
// (the resumed pass returns `approved`).
export const variantResultSchema = z.object({
  contentItemId: z.string(),
  status: z.enum(['approved', 'suspended']),
  isThread: z.boolean(),
  classification: complianceClassificationEnum,
  needsDisclaimer: z.boolean(),
  charCount: z.number(),
});
export type VariantResult = z.infer<typeof variantResultSchema>;
