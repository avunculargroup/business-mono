import { z } from 'zod';

// Schemas for the Campaign Strategy workflow (Step 7 of the Social Campaigns
// build). One run per campaign: Margot synthesises a strategy → Gate 1 → Margot
// plans ordered beats + a schedule across slots → Gate 2 → the strategy locks
// and beats + schedule persist. See docs/social-campaign-workflows-flow.md
// (Workflow 1) and docs/social-campaigns-spec.md (campaigns.strategy shape).

export const platformEnum = z.enum(['linkedin', 'twitter_x']);
export type Platform = z.infer<typeof platformEnum>;

// The campaign row already holds objective/audience/accounts/cadence (written by
// the creation wizard), so the run only needs the campaign id.
export const strategyInputSchema = z.object({
  campaignId: z.string().uuid(),
});
export type StrategyInput = z.infer<typeof strategyInputSchema>;

// The structured strategy object — campaigns.strategy. Margot emits this; the
// Gate 1 UI renders it editably. Arrays default to [] so a partial generation
// still parses.
export const strategyObjectSchema = z.object({
  content_pillars: z.array(z.string()).default([]),
  key_messages: z.array(z.string()).default([]),
  audience_summary: z.string().default(''),
  tone_guidance: z.string().default(''),
  hooks: z.array(z.string()).default([]),
  hashtags: z.array(z.string()).default([]),
  do_not_say: z.array(z.string()).default([]),
  success_signals: z.array(z.string()).default([]),
});
export type StrategyObject = z.infer<typeof strategyObjectSchema>;

// A single beat as Margot plans it (no id/sequence yet — assigned at persist).
export const plannedBeatSchema = z.object({
  title: z.string().default(''),
  core_message: z.string(),
  rationale: z.string().default(''),
  prefer_thread: z.boolean().default(false),
});
export type PlannedBeat = z.infer<typeof plannedBeatSchema>;

// What Margot returns from the beat-plan step: ordered beats. The schedule is
// computed deterministically from cadence (schedule.ts), not by Margot.
export const beatPlanSchema = z.object({
  beats: z.array(plannedBeatSchema).default([]),
});
export type BeatPlan = z.infer<typeof beatPlanSchema>;

// A configured posting slot (campaigns.post_slots.slots[]).
export const scheduleSlotSchema = z.object({
  day: z.string(),
  time: z.string(),
  label: z.string().optional(),
});
export type ScheduleSlot = z.infer<typeof scheduleSlotSchema>;

// One planned (beat × account) variant placement. beat_id is null until beats
// persist (Gate 2 approval); Step 8 fan-out reads the finalised plan.
export const scheduleEntrySchema = z.object({
  beat_sequence: z.number(),
  beat_title: z.string().nullable(),
  beat_id: z.string().nullable().default(null),
  social_account_id: z.string(),
  slot_label: z.string().nullable(),
  scheduled_for: z.string().nullable(),
});
export type ScheduleEntry = z.infer<typeof scheduleEntrySchema>;

export const schedulePlanSchema = z.object({
  posts_per_week: z.number(),
  duration_weeks: z.number(),
  start_date: z.string().nullable(),
  slots: z.array(scheduleSlotSchema),
  entries: z.array(scheduleEntrySchema),
});
export type SchedulePlan = z.infer<typeof schedulePlanSchema>;

// A participating account, resolved from campaign_accounts → social_accounts.
export const accountRefSchema = z.object({
  id: z.string(),
  platform: platformEnum,
  display_name: z.string(),
});
export type AccountRef = z.infer<typeof accountRefSchema>;

// The campaign fields the workflow reads, assembled by resolve-context.
export const strategyContextSchema = z.object({
  campaignId: z.string().uuid(),
  name: z.string(),
  objective: z.string(),
  // campaigns.audience_filter JSONB — loose; the prompt reads known fields.
  audienceFilter: z.record(z.string(), z.unknown()),
  audiencePersona: z.string(),
  // Pre-rendered company <brand-voice> block (null when the canon isn't seeded).
  voiceBlock: z.string().nullable(),
  // Formatted prior-campaign learnings (empty string when there are none).
  priorLearnings: z.string(),
  accounts: z.array(accountRefSchema),
  postSlots: z.array(scheduleSlotSchema),
  postsPerWeek: z.number(),
  durationWeeks: z.number(),
  startDate: z.string().nullable(),
});
export type StrategyContext = z.infer<typeof strategyContextSchema>;

// ── Gate 1 — strategy review ──────────────────────────────────────────────────

// Resume payload from the wizard's strategy-review step. An approve may carry an
// edited strategy (the UI lets the founder tweak before approving); a
// request_change regenerates with an instruction.
export const gate1ResumeSchema = z.object({
  decision: z.enum(['approve', 'request_change']),
  strategy: strategyObjectSchema.optional(),
  instruction: z.string().optional(),
  approvedBy: z.string().uuid().optional(),
});
export type Gate1Resume = z.infer<typeof gate1ResumeSchema>;

export const gate1SuspendSchema = z.object({
  gate: z.literal('gate1'),
  campaignId: z.string(),
  strategy: strategyObjectSchema,
});

// ── Gate 2 — plan review ──────────────────────────────────────────────────────

export const gate2ResumeSchema = z.object({
  decision: z.enum(['approve', 'request_change']),
  // An approve may carry edited beats (re-sequenced/edited in the calendar UI).
  beats: z.array(plannedBeatSchema).optional(),
  instruction: z.string().optional(),
  approvedBy: z.string().uuid().optional(),
});
export type Gate2Resume = z.infer<typeof gate2ResumeSchema>;

export const gate2SuspendSchema = z.object({
  gate: z.literal('gate2'),
  campaignId: z.string(),
  beats: z.array(plannedBeatSchema),
  schedule: schedulePlanSchema,
});

// Per-run state so a regeneration at a gate survives the resume re-entry.
export const strategyStateSchema = z.object({
  strategy: strategyObjectSchema.optional(),
  beatPlan: beatPlanSchema.optional(),
});
export type StrategyState = z.infer<typeof strategyStateSchema>;

// Terminal result. `suspended` is the placeholder returned on each suspend pass;
// the final resumed pass returns `plan_approved`.
export const strategyResultSchema = z.object({
  campaignId: z.string(),
  status: z.enum(['suspended', 'strategy_approved', 'plan_approved']),
  beatCount: z.number(),
});
export type StrategyResult = z.infer<typeof strategyResultSchema>;
