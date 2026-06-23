'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// Server actions for the Social Campaigns feature.
//
// Two web→agents handoff paths, both via Supabase (the web app never reaches the
// agents server over HTTP):
//   * Variant Gate 3 — content_items.pending_decision (variantGateWeb listener).
//   * Campaign Strategy gates 1 & 2 — campaigns.pending_decision
//     (strategyGateWeb listener): a { decision: 'start' } launches the run, a
//     gate resume payload advances it.
//
// The campaign tables + gate columns aren't in the generated web Database types
// until db:generate-types runs post-migration — cast at the boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = { from: (t: string) => any };

// ── Variant Gate 3 (Step 6) ───────────────────────────────────────────────────

const variantDecisionSchema = z.object({
  decision: z.enum(['approve', 'request_change']),
  instruction: z.string().trim().min(1).max(2000).optional(),
  approvedBy: z.string().uuid().optional(),
});

export async function submitVariantGateDecision(
  contentItemId: string,
  decision: unknown,
): Promise<{ success?: true; error?: string }> {
  const parsed = variantDecisionSchema.safeParse(decision);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid decision' };
  }
  if (parsed.data.decision === 'request_change' && !parsed.data.instruction) {
    return { error: 'Tell Charlie what to change before requesting a revision.' };
  }

  const supabase = (await createClient()) as unknown as AnyDb;
  const { error } = await supabase
    .from('content_items')
    .update({ pending_decision: parsed.data })
    .eq('id', contentItemId);
  if (error) return { error: error.message };

  revalidatePath(`/campaigns/variants/${contentItemId}`);
  return { success: true };
}

// ── Campaign creation wizard ──────────────────────────────────────────────────

const audienceFilterSchema = z.object({
  industry: z.array(z.string()).default([]),
  pipeline_stage: z.array(z.string()).default([]),
  bitcoin_literacy_min: z.string().optional(),
});

const draftSchema = z.object({
  name: z.string().trim().min(1, 'Give the campaign a name.').max(200),
  objective: z.string().trim().min(1, 'Describe the campaign objective.').max(2000),
  audienceFilter: audienceFilterSchema,
  audiencePersona: z.string().trim().max(2000).optional(),
});

/** Step 1 — create a draft campaign row. Returns its id so the wizard can
 *  advance to the accounts & cadence step. */
export async function createCampaignDraft(
  input: unknown,
): Promise<{ id?: string; error?: string }> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Invalid campaign' };

  const supabase = (await createClient()) as unknown as AnyDb;
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      name: parsed.data.name,
      objective: parsed.data.objective,
      audience_filter: parsed.data.audienceFilter,
      audience_persona: parsed.data.audiencePersona ?? null,
      status: 'draft',
    })
    .select('id')
    .single();
  if (error) return { error: error.message };

  revalidatePath('/campaigns');
  return { id: (data as { id: string }).id };
}

const slotSchema = z.object({
  day: z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Use a HH:MM time.'),
  label: z.string().trim().max(60).optional(),
});

const cadenceSchema = z.object({
  accountIds: z.array(z.string().uuid()).min(1, 'Pick at least one account.'),
  postsPerWeek: z.number().int().min(1).max(50),
  slots: z.array(slotSchema).min(1, 'Add at least one posting slot.'),
  durationWeeks: z.number().int().min(1).max(52),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a start date.'),
});

/** Step 2 — save participating accounts + cadence, then signal the agents server
 *  to launch the strategy workflow ({ decision: 'start' } on pending_decision).
 *  Guarded to draft campaigns so a re-run can't relaunch a locked campaign. */
export async function launchCampaignStrategy(
  campaignId: string,
  input: unknown,
): Promise<{ success?: true; error?: string }> {
  const parsed = cadenceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Invalid cadence' };

  const supabase = (await createClient()) as unknown as AnyDb;

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('status')
    .eq('id', campaignId)
    .maybeSingle();
  if (!campaign) return { error: 'Campaign not found.' };
  if ((campaign as { status: string }).status !== 'draft') {
    return { error: 'This campaign has already started — cadence is locked.' };
  }

  const { error: updateErr } = await supabase
    .from('campaigns')
    .update({
      posts_per_week: parsed.data.postsPerWeek,
      post_slots: { slots: parsed.data.slots },
      duration_weeks: parsed.data.durationWeeks,
      start_date: parsed.data.startDate,
    })
    .eq('id', campaignId);
  if (updateErr) return { error: updateErr.message };

  // Replace the participating-accounts join wholesale.
  await supabase.from('campaign_accounts').delete().eq('campaign_id', campaignId);
  const { error: accErr } = await supabase
    .from('campaign_accounts')
    .insert(parsed.data.accountIds.map((id) => ({ campaign_id: campaignId, social_account_id: id })));
  if (accErr) return { error: accErr.message };

  // Launch: the strategyGateWeb listener reacts to this pending_decision.
  const { error: startErr } = await supabase
    .from('campaigns')
    .update({ pending_decision: { decision: 'start' } })
    .eq('id', campaignId);
  if (startErr) return { error: startErr.message };

  revalidatePath(`/campaigns/${campaignId}`);
  return { success: true };
}

// ── Strategy gates 1 & 2 ──────────────────────────────────────────────────────

const strategyObjectSchema = z.object({
  content_pillars: z.array(z.string()).default([]),
  key_messages: z.array(z.string()).default([]),
  audience_summary: z.string().default(''),
  tone_guidance: z.string().default(''),
  hooks: z.array(z.string()).default([]),
  hashtags: z.array(z.string()).default([]),
  do_not_say: z.array(z.string()).default([]),
  success_signals: z.array(z.string()).default([]),
});

const plannedBeatSchema = z.object({
  title: z.string().default(''),
  core_message: z.string().min(1),
  rationale: z.string().default(''),
  prefer_thread: z.boolean().default(false),
});

const gateDecisionSchema = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('approve'),
    // Gate 1 may carry an edited strategy; Gate 2 may carry edited beats.
    strategy: strategyObjectSchema.optional(),
    beats: z.array(plannedBeatSchema).optional(),
  }),
  z.object({
    decision: z.literal('request_change'),
    instruction: z.string().trim().min(1, 'Say what to change.').max(2000),
  }),
]);

/** Write a Gate 1 or Gate 2 decision for a suspended campaign. The strategyGateWeb
 *  listener reads campaigns.gate_state to know which gate is being decided, then
 *  resumes the run. Guarded to suspended states (the application-layer strategy
 *  lock: once status is plan_approved or later, no gate is open to edit). */
export async function submitCampaignGateDecision(
  campaignId: string,
  decision: unknown,
): Promise<{ success?: true; error?: string }> {
  const parsed = gateDecisionSchema.safeParse(decision);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Invalid decision' };

  const supabase = (await createClient()) as unknown as AnyDb;
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('status, gate_state, workflow_run_id')
    .eq('id', campaignId)
    .maybeSingle();
  if (!campaign) return { error: 'Campaign not found.' };

  const c = campaign as { status: string; gate_state: { gate?: string } | null; workflow_run_id: string | null };
  if (!c.workflow_run_id || !c.gate_state?.gate) {
    return { error: 'No review is open for this campaign right now.' };
  }
  // Strategy lock: only draft (gate 1) and strategy_approved (gate 2) campaigns
  // have an open gate. plan_approved or later is locked.
  if (c.status !== 'draft' && c.status !== 'strategy_approved') {
    return { error: 'This campaign is locked — its plan has been approved.' };
  }

  const { error } = await supabase
    .from('campaigns')
    .update({ pending_decision: parsed.data })
    .eq('id', campaignId);
  if (error) return { error: error.message };

  revalidatePath(`/campaigns/${campaignId}`);
  return { success: true };
}

// ── Ready-to-post queue (Step 8) ──────────────────────────────────────────────

const markPostedSchema = z.object({
  url: z.string().trim().url('Paste the live post URL.').max(2000),
});

/** Mark an approved variant as posted: record the live URL and advance it to
 *  published. Guarded to approved variants so a double-submit can't clobber a
 *  row that already moved on. */
export async function markVariantPosted(
  contentItemId: string,
  campaignId: string,
  input: unknown,
): Promise<{ success?: true; error?: string }> {
  const parsed = markPostedSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Invalid URL' };

  const supabase = (await createClient()) as unknown as AnyDb;
  const { data, error } = await supabase
    .from('content_items')
    .update({
      published_url: parsed.data.url,
      published_at: new Date().toISOString(),
      status: 'published',
    })
    .eq('id', contentItemId)
    .eq('status', 'approved')
    .select('id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: 'This variant is no longer ready to post — refresh the queue.' };
  }

  revalidatePath(`/campaigns/${campaignId}/queue`);
  revalidatePath(`/campaigns/${campaignId}`);
  return { success: true };
}
