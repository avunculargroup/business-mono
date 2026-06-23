import { supabase } from '@platform/db';
import { startVariantRun } from '../variant/run.js';
import { schedulePlanSchema, type SchedulePlan } from './schemas.js';
import type { VariantInput } from '../variant/schemas.js';

// Step 8 — fan-out. On plan approval the Campaign Strategy workflow persists the
// beats and the (beat × account) schedule, then locks (status = plan_approved).
// Fan-out turns that plan into work: one Variant Generation run per schedule
// entry, each with its own workflow_run_id, isolated retries, and its own Gate 3
// approval. Fire-and-track (the flow-doc's recommended posture) — the caller
// kicks this off without blocking on the slowest variant; we run the starts
// sequentially in the background so we don't fire a burst of LLM calls at once.

// campaign + content_items columns aren't in the generated Database types until
// types are regenerated post-migration. Cast at the boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface PlannedVariant {
  input: VariantInput;
  scheduledFor: string | null;
}

/** Map a persisted schedule plan to the variant runs to spawn. Pure, so the
 *  (beat × account) → input mapping can be unit-tested. Entries without a
 *  persisted beat_id are skipped (shouldn't happen after finaliseSchedulePlan). */
export function planEntriesToVariantInputs(
  campaignId: string,
  plan: SchedulePlan,
): PlannedVariant[] {
  const out: PlannedVariant[] = [];
  for (const entry of plan.entries) {
    if (!entry.beat_id) continue;
    out.push({
      input: {
        campaignId,
        beatId: entry.beat_id,
        socialAccountId: entry.social_account_id,
      },
      scheduledFor: entry.scheduled_for,
    });
  }
  return out;
}

async function logFanOutActivity(campaignId: string, spawned: number): Promise<void> {
  const { error } = await db.from('agent_activity').insert({
    agent_name: 'margot',
    action: 'campaign_fanned_out',
    status: 'auto',
    trigger_type: 'manual',
    entity_type: 'campaign',
    entity_id: campaignId,
    proposed_actions: [{ type: 'fan_out', variants: spawned }],
  } as never);
  if (error) console.error('[fan-out] agent_activity insert failed:', error.message);
}

/**
 * Fan a plan-approved campaign out into variant runs. Atomically claims the
 * plan_approved → active transition first, so a repeated trigger (e.g. a resume
 * replayed) can't double-spawn. Returns how many variants were started; claimed
 * = false means another caller already fanned this campaign out (or it isn't
 * ready). Each variant start runs Charlie + Lex and suspends at Gate 3, leaving
 * a content_item draft the matrix and the variant editor render.
 */
export async function fanOutCampaign(args: {
  campaignId: string;
}): Promise<{ claimed: boolean; spawned: number }> {
  const { campaignId } = args;

  // Read the plan before claiming so we can bail cleanly if it's missing.
  const { data: campaign } = await db
    .from('campaigns')
    .select('status, schedule_plan')
    .eq('id', campaignId)
    .maybeSingle();
  if (!campaign) return { claimed: false, spawned: 0 };

  const parsedPlan = schedulePlanSchema.safeParse((campaign as { schedule_plan: unknown }).schedule_plan);
  if (!parsedPlan.success) {
    console.error('[fan-out] campaign', campaignId, 'has no usable schedule_plan');
    return { claimed: false, spawned: 0 };
  }

  // Atomic claim: only the caller that flips plan_approved → active proceeds.
  const { data: claimed } = await db
    .from('campaigns')
    .update({ status: 'active' } as never)
    .eq('id', campaignId)
    .eq('status', 'plan_approved')
    .select('id');
  if (!claimed || claimed.length === 0) return { claimed: false, spawned: 0 };

  const planned = planEntriesToVariantInputs(campaignId, parsedPlan.data);
  let spawned = 0;
  for (const { input, scheduledFor } of planned) {
    try {
      const { contentItemId } = await startVariantRun(input);
      if (contentItemId && scheduledFor) {
        await db
          .from('content_items')
          .update({ scheduled_for: scheduledFor } as never)
          .eq('id', contentItemId);
      }
      spawned += 1;
    } catch (err) {
      // One variant failing must not abort the rest — each is its own run.
      console.error('[fan-out] variant start failed for', input.beatId, input.socialAccountId, err);
    }
  }

  await logFanOutActivity(campaignId, spawned);
  return { claimed: true, spawned };
}
