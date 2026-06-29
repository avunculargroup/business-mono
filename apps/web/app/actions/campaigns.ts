'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { humanizeError } from '@/lib/errors';

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
  if (error) return { error: humanizeError(error) };

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
  if (error) return { error: humanizeError(error) };

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
  if (updateErr) return { error: humanizeError(updateErr) };

  // Replace the participating-accounts join wholesale.
  await supabase.from('campaign_accounts').delete().eq('campaign_id', campaignId);
  const { error: accErr } = await supabase
    .from('campaign_accounts')
    .insert(parsed.data.accountIds.map((id) => ({ campaign_id: campaignId, social_account_id: id })));
  if (accErr) return { error: humanizeError(accErr) };

  // Launch: the strategyGateWeb listener reacts to this pending_decision.
  const { error: startErr } = await supabase
    .from('campaigns')
    .update({ pending_decision: { decision: 'start' } })
    .eq('id', campaignId);
  if (startErr) return { error: humanizeError(startErr) };

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
  if (error) return { error: humanizeError(error) };

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
  if (error) return { error: humanizeError(error) };
  if (!data || data.length === 0) {
    return { error: 'This variant is no longer ready to post — refresh the queue.' };
  }

  revalidatePath(`/campaigns/${campaignId}/queue`);
  revalidatePath(`/campaigns/${campaignId}`);
  return { success: true };
}

// ── Loops & polish (Step 9) ───────────────────────────────────────────────────

/** Codepoint count — closer to how platforms count than UTF-16 .length. */
function charCount(text: string): number {
  return Array.from(text).length;
}

const editCopySchema = z.object({
  isThread: z.boolean(),
  body: z.string().trim().max(30000).default(''),
  segments: z.array(z.string().trim().min(1)).default([]),
});

/**
 * Edit a campaign variant's copy. Resets compliance to pending (a cleared
 * verdict must not survive an edit) so the agents complianceRecheck listener
 * re-runs Lex. Patches the suspended gate_state preview so the editor shows the
 * edited text immediately, while the new verdict fills in shortly.
 */
export async function editVariantCopy(
  contentItemId: string,
  input: unknown,
): Promise<{ success?: true; error?: string }> {
  const parsed = editCopySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Invalid copy' };
  const { isThread, body, segments } = parsed.data;
  if (isThread && segments.length === 0) return { error: 'A thread needs at least one segment.' };
  if (!isThread && !body) return { error: 'The post body cannot be empty.' };

  const supabase = (await createClient()) as unknown as AnyDb;

  const { data: existing } = await supabase
    .from('content_items')
    .select('gate_state')
    .eq('id', contentItemId)
    .maybeSingle();
  if (!existing) return { error: 'Variant not found.' };

  // Patch the suspended preview's copy so the editor reflects the edit at once.
  const gateState = (existing as { gate_state: { preview?: Record<string, unknown> } | null }).gate_state;
  const patchedGate =
    gateState?.preview != null
      ? {
          ...gateState,
          preview: {
            ...gateState.preview,
            isThread,
            body,
            segments,
            charCount: isThread
              ? charCount(segments.map((s, i) => `${i + 1}/ ${s}`).join('\n\n'))
              : charCount(body),
          },
        }
      : gateState;

  const { error } = await supabase
    .from('content_items')
    .update({
      body: body || null,
      is_thread: isThread,
      char_count: isThread ? null : charCount(body),
      compliance_status: 'pending',
      compliance_checked_at: null,
      gate_state: patchedGate,
    })
    .eq('id', contentItemId);
  if (error) return { error: humanizeError(error) };

  // Replace thread segments wholesale.
  await supabase.from('thread_segments').delete().eq('content_item_id', contentItemId);
  if (isThread && segments.length > 0) {
    const rows = segments.map((b, i) => ({
      content_item_id: contentItemId,
      sequence: i + 1,
      body: b,
      char_count: charCount(b),
    }));
    const { error: segErr } = await supabase.from('thread_segments').insert(rows);
    if (segErr) return { error: humanizeError(segErr) };
  }

  revalidatePath(`/campaigns/variants/${contentItemId}`);
  return { success: true };
}

const metricsSchema = z.object({
  impressions: z.number().int().min(0).nullable().optional(),
  reactions: z.number().int().min(0).nullable().optional(),
  comments: z.number().int().min(0).nullable().optional(),
  reposts: z.number().int().min(0).nullable().optional(),
  clicks: z.number().int().min(0).nullable().optional(),
});

/** Save (upsert) manual post-hoc metrics for a published variant. One row per
 *  content_item (UNIQUE), updated in place — no snapshots. */
export async function savePostMetrics(
  contentItemId: string,
  campaignId: string,
  platform: string,
  input: unknown,
): Promise<{ success?: true; error?: string }> {
  const parsed = metricsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Invalid metrics' };

  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  const supabase = client as unknown as AnyDb;

  const { error } = await supabase.from('post_metrics').upsert(
    {
      content_item_id: contentItemId,
      platform,
      impressions: parsed.data.impressions ?? null,
      reactions: parsed.data.reactions ?? null,
      comments: parsed.data.comments ?? null,
      reposts: parsed.data.reposts ?? null,
      clicks: parsed.data.clicks ?? null,
      recorded_at: new Date().toISOString(),
      recorded_by: user?.id ?? null,
    },
    { onConflict: 'content_item_id' },
  );
  if (error) return { error: humanizeError(error) };

  revalidatePath(`/campaigns/${campaignId}`);
  return { success: true };
}

const promoteSchema = z.object({
  body: z.string().trim().min(1, 'Nothing to save.'),
  curator_note: z.string().trim().min(1, 'Add a note on why this post demonstrates the voice.'),
  snippet_type: z
    .enum(['phrase', 'opener', 'closer', 'transition', 'paragraph', 'full_post', 'cta'])
    .default('full_post'),
  topic_tags: z.array(z.string()).default([]),
});

/** Promote a strong published post into the voice exemplar library. Saved
 *  against the post's own account (source = promoted_from_post), with the
 *  founder's curator note. The agents embed-on-write keeps it retrievable. */
export async function promotePostToSnippet(
  contentItemId: string,
  campaignId: string,
  input: unknown,
): Promise<{ success?: true; error?: string }> {
  const parsed = promoteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Invalid snippet' };

  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  const supabase = client as unknown as AnyDb;

  // The post's account + platform anchor the snippet to that voice.
  const { data: item } = await supabase
    .from('content_items')
    .select('social_account_id, type')
    .eq('id', contentItemId)
    .maybeSingle();
  const account = item as { social_account_id: string | null; type: string | null } | null;

  const { error } = await supabase.from('voice_snippets').insert({
    social_account_id: account?.social_account_id ?? null,
    snippet_type: parsed.data.snippet_type,
    body: parsed.data.body,
    curator_note: parsed.data.curator_note,
    platform: account?.type === 'linkedin' || account?.type === 'twitter_x' ? account.type : null,
    topic_tags: parsed.data.topic_tags,
    source: 'promoted_from_post',
    source_content_item_id: contentItemId,
    created_by: user?.id ?? null,
  });
  if (error) return { error: humanizeError(error) };

  revalidatePath(`/campaigns/${campaignId}`);
  return { success: true };
}
