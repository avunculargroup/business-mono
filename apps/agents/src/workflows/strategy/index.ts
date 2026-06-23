import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { supabase } from '@platform/db';
import { stepRequestContext } from '../../config/model.js';
import { resolveCompanyVoiceBlock } from '../../lib/voicePrompt.js';
import { margot } from '../../agents/margot/index.js';
import { rex } from '../../agents/researcher/index.js';
import { bruno } from '../../agents/ba/index.js';
import {
  buildStrategyPrompt,
  buildBeatPlanPrompt,
  buildResearchPrompt,
  buildAudiencePrompt,
  formatPriorLearnings,
  shouldRunResearch,
  shouldRunAudienceAnalysis,
} from './prompts.js';
import { buildSchedule, finaliseSchedulePlan } from './schedule.js';
import { buildBeatRows } from './persist.js';
import {
  strategyInputSchema,
  strategyContextSchema,
  strategyObjectSchema,
  beatPlanSchema,
  gate1ResumeSchema,
  gate1SuspendSchema,
  gate2ResumeSchema,
  gate2SuspendSchema,
  strategyStateSchema,
  strategyResultSchema,
  type Platform,
  type StrategyContext,
  type StrategyObject,
  type BeatPlan,
  type SchedulePlan,
  type StrategyResult,
} from './schemas.js';

// ── Campaign Strategy workflow (Step 7) ───────────────────────────────────────
// One run per campaign: resolve context → Margot synthesises a strategy → GATE 1
// → Margot plans ordered beats → GATE 2 → persist beats + the schedule and lock
// the strategy (status = plan_approved). See docs/social-campaign-workflows-flow.md
// (Workflow 1). Fan-out (a variant run per beat × account) is Step 8.

// The campaign tables and the Step 7 gate columns (workflow_run_id, gate_state,
// pending_decision, schedule_plan) aren't in the generated Database types until
// `pnpm db:generate-types` runs after the migrations apply. Cast to bypass typing
// until then — the same pattern the variant workflow uses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ── Agent invocations (reused by the gate regenerate paths) ───────────────────

async function synthesiseStrategy(ctx: StrategyContext, instruction?: string): Promise<StrategyObject> {
  const fallback = strategyObjectSchema.parse({});
  const response = await margot.generate(
    [{ role: 'user', content: buildStrategyPrompt(ctx, instruction) }],
    {
      requestContext: stepRequestContext('strategy.synthesise'),
      structuredOutput: {
        schema: strategyObjectSchema,
        errorStrategy: 'fallback',
        fallbackValue: fallback,
      },
    },
  );
  return strategyObjectSchema.parse(response.object ?? fallback);
}

async function planBeats(
  ctx: StrategyContext,
  strategy: StrategyObject,
  instruction?: string,
): Promise<BeatPlan> {
  const fallback = beatPlanSchema.parse({});
  const response = await margot.generate(
    [{ role: 'user', content: buildBeatPlanPrompt(ctx, strategy, instruction) }],
    {
      requestContext: stepRequestContext('strategy.plan_beats'),
      structuredOutput: {
        schema: beatPlanSchema,
        errorStrategy: 'fallback',
        fallbackValue: fallback,
      },
    },
  );
  return beatPlanSchema.parse(response.object ?? fallback);
}

/** Rex research branch — a prose brief, best-effort. Optional enrichment, so a
 *  failure (rate limit, model error) yields '' rather than aborting the run. */
async function runResearch(ctx: StrategyContext): Promise<string> {
  try {
    const response = await rex.generate([{ role: 'user', content: buildResearchPrompt(ctx) }], {
      requestContext: stepRequestContext('strategy.research'),
    });
    return response.text?.trim() ?? '';
  } catch (err) {
    console.warn('[strategy] research branch failed (continuing):', err);
    return '';
  }
}

/** Bruno audience-analysis branch — a prose analysis, best-effort. */
async function runAudienceAnalysis(ctx: StrategyContext, companyNames: string[]): Promise<string> {
  try {
    const response = await bruno.generate(
      [{ role: 'user', content: buildAudiencePrompt(ctx, companyNames) }],
      { requestContext: stepRequestContext('strategy.audience') },
    );
    return response.text?.trim() ?? '';
  } catch (err) {
    console.warn('[strategy] audience branch failed (continuing):', err);
    return '';
  }
}

/** Compute the schedule for a beat plan from the campaign cadence. */
function scheduleFor(ctx: StrategyContext, plan: BeatPlan): SchedulePlan {
  return buildSchedule({
    beats: plan.beats.map((b, i) => ({ sequence: i + 1, title: b.title || null })),
    accountIds: ctx.accounts.map((a) => a.id),
    slots: ctx.postSlots,
    postsPerWeek: ctx.postsPerWeek,
    durationWeeks: ctx.durationWeeks,
    startDate: ctx.startDate,
  });
}

async function logStrategyActivity(
  campaignId: string,
  action: 'strategy_synthesised' | 'beat_plan_proposed' | 'strategy_approved' | 'plan_approved',
  runId: string | undefined,
  status: 'pending' | 'approved',
): Promise<void> {
  const { error } = await db.from('agent_activity').insert({
    agent_name: 'margot',
    action,
    status,
    trigger_type: 'manual',
    workflow_run_id: runId ?? null,
    entity_type: 'campaign',
    entity_id: campaignId,
  } as never);
  if (error) console.error('[strategy] agent_activity insert failed:', error.message);
}

// ── Steps ─────────────────────────────────────────────────────────────────────

const resolveContextStep = createStep({
  id: 'resolve_context',
  inputSchema: strategyInputSchema,
  outputSchema: z.object({ ctx: strategyContextSchema }),
  execute: async ({ inputData }) => {
    const { campaignId } = inputData;

    const { data: campaign, error: campErr } = await db
      .from('campaigns')
      .select(
        'id, name, objective, audience_filter, audience_persona, post_slots, posts_per_week, duration_weeks, start_date',
      )
      .eq('id', campaignId)
      .single();
    if (campErr || !campaign) {
      throw new Error(`campaign ${campaignId} not found: ${campErr?.message ?? 'missing'}`);
    }
    const c = campaign as {
      name: string | null;
      objective: string | null;
      audience_filter: Record<string, unknown> | null;
      audience_persona: string | null;
      post_slots: { slots?: Array<{ day: string; time: string; label?: string }> } | null;
      posts_per_week: number | null;
      duration_weeks: number | null;
      start_date: string | null;
    };

    // Participating accounts: campaign_accounts → social_accounts (fan-out order).
    const { data: links } = await db
      .from('campaign_accounts')
      .select('social_account_id')
      .eq('campaign_id', campaignId);
    const accountIds = ((links ?? []) as Array<{ social_account_id: string }>).map(
      (l) => l.social_account_id,
    );
    let accounts: StrategyContext['accounts'] = [];
    if (accountIds.length > 0) {
      const { data: accs } = await db
        .from('social_accounts')
        .select('id, platform, display_name')
        .in('id', accountIds);
      accounts = ((accs ?? []) as Array<{ id: string; platform: Platform; display_name: string | null }>).map(
        (a) => ({ id: a.id, platform: a.platform, display_name: a.display_name ?? 'BTS' }),
      );
    }

    // Prior-campaign learnings: published campaign posts + their metrics.
    let priorLearnings = '';
    const { data: priorPosts } = await db
      .from('content_items')
      .select('id, title, type')
      .eq('status', 'published')
      .not('campaign_id', 'is', null)
      .order('published_at', { ascending: false })
      .limit(8);
    const posts = (priorPosts ?? []) as Array<{ id: string; title: string | null; type: string | null }>;
    if (posts.length > 0) {
      const { data: metrics } = await db
        .from('post_metrics')
        .select('content_item_id, impressions, reactions')
        .in(
          'content_item_id',
          posts.map((p) => p.id),
        );
      const byItem = new Map(
        ((metrics ?? []) as Array<{ content_item_id: string; impressions: number | null; reactions: number | null }>).map(
          (m) => [m.content_item_id, m],
        ),
      );
      priorLearnings = formatPriorLearnings(
        posts.map((p) => ({
          title: p.title,
          type: p.type,
          impressions: byItem.get(p.id)?.impressions ?? null,
          reactions: byItem.get(p.id)?.reactions ?? null,
        })),
      );
    }

    const voiceBlock = await resolveCompanyVoiceBlock({ query: c.objective ?? c.name });

    const ctx = strategyContextSchema.parse({
      campaignId,
      name: c.name ?? 'Untitled campaign',
      objective: c.objective ?? '',
      audienceFilter: c.audience_filter ?? {},
      audiencePersona: c.audience_persona ?? '',
      voiceBlock,
      priorLearnings,
      accounts,
      postSlots: c.post_slots?.slots ?? [],
      postsPerWeek: c.posts_per_week ?? 0,
      durationWeeks: c.duration_weeks ?? 0,
      startDate: c.start_date ?? null,
    });
    return { ctx };
  },
});

// Optional branch: Rex research. Runs only when the objective references current
// events/competitors/trends; otherwise passes ctx through untouched. Its output
// is cached in the run snapshot, so a gate resume never re-runs it.
const researchStep = createStep({
  id: 'research',
  inputSchema: z.object({ ctx: strategyContextSchema }),
  outputSchema: z.object({ ctx: strategyContextSchema }),
  execute: async ({ inputData }) => {
    const { ctx } = inputData;
    if (!shouldRunResearch(ctx.objective)) return { ctx };
    const researchBrief = await runResearch(ctx);
    return { ctx: { ...ctx, researchBrief } };
  },
});

// Optional branch: Bruno audience analysis. Runs only when the audience_filter
// names a real CRM segment; pulls a few representative companies as context.
const audienceStep = createStep({
  id: 'audience',
  inputSchema: z.object({ ctx: strategyContextSchema }),
  outputSchema: z.object({ ctx: strategyContextSchema }),
  execute: async ({ inputData }) => {
    const { ctx } = inputData;
    if (!shouldRunAudienceAnalysis(ctx.audienceFilter)) return { ctx };

    // Light CRM lookup: representative companies in the filtered industries.
    let companyNames: string[] = [];
    const industries = Array.isArray(ctx.audienceFilter['industry'])
      ? (ctx.audienceFilter['industry'] as unknown[]).filter((x) => typeof x === 'string')
      : [];
    if (industries.length > 0) {
      try {
        const { data } = await db
          .from('companies')
          .select('name')
          .in('industry', industries as string[])
          .limit(8);
        companyNames = ((data ?? []) as Array<{ name: string | null }>)
          .map((c) => c.name)
          .filter((n): n is string => Boolean(n));
      } catch (err) {
        console.warn('[strategy] audience CRM lookup failed (continuing):', err);
      }
    }

    const audienceAnalysis = await runAudienceAnalysis(ctx, companyNames);
    return { ctx: { ...ctx, audienceAnalysis } };
  },
});

const synthesiseStep = createStep({
  id: 'synthesise_strategy',
  inputSchema: z.object({ ctx: strategyContextSchema }),
  outputSchema: z.object({ ctx: strategyContextSchema, strategy: strategyObjectSchema }),
  execute: async ({ inputData, runId }) => {
    const { ctx } = inputData;
    const strategy = await synthesiseStrategy(ctx);
    await logStrategyActivity(ctx.campaignId, 'strategy_synthesised', runId, 'pending');
    return { ctx, strategy };
  },
});

const gate1Step = createStep({
  id: 'gate1',
  inputSchema: z.object({ ctx: strategyContextSchema, strategy: strategyObjectSchema }),
  resumeSchema: gate1ResumeSchema,
  suspendSchema: gate1SuspendSchema,
  stateSchema: strategyStateSchema,
  outputSchema: z.object({ ctx: strategyContextSchema, strategy: strategyObjectSchema }),
  execute: async ({ inputData, resumeData, suspend, state, setState, runId }) => {
    const { ctx } = inputData;
    let strategy: StrategyObject = state?.strategy
      ? strategyObjectSchema.parse(state.strategy)
      : inputData.strategy;

    const suspendAtGate = async () => {
      const payload = { gate: 'gate1' as const, campaignId: ctx.campaignId, strategy };
      await db
        .from('campaigns')
        .update({ workflow_run_id: runId ?? null, gate_state: payload, pending_decision: null } as never)
        .eq('id', ctx.campaignId);
      await suspend(payload);
    };

    if (!resumeData) {
      await suspendAtGate();
      return { ctx, strategy };
    }

    if (resumeData.decision === 'request_change') {
      strategy = await synthesiseStrategy(ctx, resumeData.instruction);
      await setState({ ...state, strategy });
      await suspendAtGate();
      return { ctx, strategy };
    }

    // approve — the founder may have edited the strategy in the UI.
    const approved = resumeData.strategy ? strategyObjectSchema.parse(resumeData.strategy) : strategy;
    const { error } = await db
      .from('campaigns')
      .update({
        strategy: approved,
        status: 'strategy_approved',
        strategy_approved_by: resumeData.approvedBy ?? null,
        strategy_approved_at: new Date().toISOString(),
        gate_state: null,
        pending_decision: null,
      } as never)
      .eq('id', ctx.campaignId);
    if (error) throw new Error(`Failed to persist approved strategy: ${error.message}`);
    await logStrategyActivity(ctx.campaignId, 'strategy_approved', runId, 'approved');
    return { ctx, strategy: approved };
  },
});

const planBeatsStep = createStep({
  id: 'plan_beats',
  inputSchema: z.object({ ctx: strategyContextSchema, strategy: strategyObjectSchema }),
  outputSchema: z.object({
    ctx: strategyContextSchema,
    strategy: strategyObjectSchema,
    beatPlan: beatPlanSchema,
  }),
  execute: async ({ inputData, runId }) => {
    const { ctx, strategy } = inputData;
    const beatPlan = await planBeats(ctx, strategy);
    await logStrategyActivity(ctx.campaignId, 'beat_plan_proposed', runId, 'pending');
    return { ctx, strategy, beatPlan };
  },
});

const gate2Step = createStep({
  id: 'gate2',
  inputSchema: z.object({
    ctx: strategyContextSchema,
    strategy: strategyObjectSchema,
    beatPlan: beatPlanSchema,
  }),
  resumeSchema: gate2ResumeSchema,
  suspendSchema: gate2SuspendSchema,
  stateSchema: strategyStateSchema,
  outputSchema: strategyResultSchema,
  execute: async ({ inputData, resumeData, suspend, state, setState, runId }) => {
    const { ctx, strategy } = inputData;
    let beatPlan: BeatPlan = state?.beatPlan
      ? beatPlanSchema.parse(state.beatPlan)
      : inputData.beatPlan;

    const result = (status: StrategyResult['status']): StrategyResult => ({
      campaignId: ctx.campaignId,
      status,
      beatCount: beatPlan.beats.length,
    });

    const suspendAtGate = async () => {
      const schedule = scheduleFor(ctx, beatPlan);
      const payload = {
        gate: 'gate2' as const,
        campaignId: ctx.campaignId,
        beats: beatPlan.beats,
        schedule,
      };
      await db
        .from('campaigns')
        .update({ workflow_run_id: runId ?? null, gate_state: payload, pending_decision: null } as never)
        .eq('id', ctx.campaignId);
      await suspend(payload);
    };

    if (!resumeData) {
      await suspendAtGate();
      return result('suspended');
    }

    if (resumeData.decision === 'request_change') {
      beatPlan = await planBeats(ctx, strategy, resumeData.instruction);
      await setState({ ...state, beatPlan });
      await suspendAtGate();
      return result('suspended');
    }

    // approve — the founder may have edited/re-sequenced the beats in the UI.
    if (resumeData.beats) {
      beatPlan = beatPlanSchema.parse({ beats: resumeData.beats });
    }

    // Persist beats, then stamp their ids onto the schedule for Step 8 fan-out.
    // Delete-before-insert so a retried approval (e.g. the campaign update below
    // failed on a prior attempt) can't duplicate beats — idempotent. Safe here:
    // no content_items reference these beats until fan-out, which is after
    // plan_approved.
    const { error: clearErr } = await db
      .from('campaign_beats')
      .delete()
      .eq('campaign_id', ctx.campaignId);
    if (clearErr) throw new Error(`Failed to clear prior campaign_beats: ${clearErr.message}`);
    const beatRows = buildBeatRows(ctx.campaignId, beatPlan.beats);
    const { data: inserted, error: beatErr } = await db
      .from('campaign_beats')
      .insert(beatRows as never)
      .select('id, sequence');
    if (beatErr) throw new Error(`Failed to persist campaign_beats: ${beatErr.message}`);
    const beatIdBySequence = new Map(
      ((inserted ?? []) as Array<{ id: string; sequence: number }>).map((r) => [r.sequence, r.id]),
    );
    const schedule = finaliseSchedulePlan(scheduleFor(ctx, beatPlan), beatIdBySequence);

    // Lock: set plan_approved and store the schedule. The strategy is NOT rewritten
    // here — it locked at Gate 1; later edits are rejected in the server actions.
    const { error: campErr } = await db
      .from('campaigns')
      .update({
        status: 'plan_approved',
        plan_approved_by: resumeData.approvedBy ?? null,
        plan_approved_at: new Date().toISOString(),
        schedule_plan: schedule,
        gate_state: null,
        pending_decision: null,
      } as never)
      .eq('id', ctx.campaignId);
    if (campErr) throw new Error(`Failed to lock campaign at plan approval: ${campErr.message}`);
    await logStrategyActivity(ctx.campaignId, 'plan_approved', runId, 'approved');
    return result('plan_approved');
  },
});

export const strategyWorkflow = createWorkflow({
  id: 'strategy',
  inputSchema: strategyInputSchema,
  stateSchema: strategyStateSchema,
  outputSchema: strategyResultSchema,
})
  .then(resolveContextStep)
  .then(researchStep)
  .then(audienceStep)
  .then(synthesiseStep)
  .then(gate1Step)
  .then(planBeatsStep)
  .then(gate2Step)
  .commit();
