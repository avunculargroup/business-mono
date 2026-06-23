import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { supabase } from '@platform/db';
import { resolveVoiceContext } from '@platform/voice';
import { formatResolvedVoice } from '../../lib/voicePrompt.js';
import { stepRequestContext } from '../../config/model.js';
import { charlie } from '../../agents/contentCreator/index.js';
import { lex } from '../../agents/lex/index.js';
import { buildCharliePrompt, buildLexPrompt, charCountOf, isThreadVariant, variantCopyText } from './prompts.js';
import { buildContentItemRow, buildThreadSegmentRows } from './persist.js';
import {
  variantInputSchema,
  variantContextSchema,
  charlieVariantSchema,
  lexVerdictSchema,
  variantGateResumeSchema,
  variantGateSuspendSchema,
  variantStateSchema,
  variantResultSchema,
  type Platform,
  type VariantContext,
  type CharlieVariant,
  type LexVerdict,
  type VariantResult,
} from './schemas.js';

// ── Variant Generation workflow (Step 6 — the leaf) ───────────────────────────
// One run per (beat × account): resolve context (voice via packages/voice incl.
// snippet retrieval) → Charlie writes platform-conformant copy → Lex classifies
// advice risk (advisory) → persist a content_item draft → Gate 3 (suspend) for
// human approval, with single-variant regeneration on "request change".
// See docs/social-campaign-workflows-flow.md (Workflow 2).

// The campaign tables (campaigns, campaign_beats, platform_specs,
// compliance_snippets, thread_segments) and the new content_items columns are
// not in the generated Database types until `pnpm db:generate-types` runs after
// the Step 4/5 migrations apply. Cast to bypass typing until then — the same
// pattern seedVoice.ts uses for the voice tables.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ── Agent invocations (reused by the gate's regenerate path) ──────────────────

async function generateVariant(ctx: VariantContext, instruction?: string): Promise<CharlieVariant> {
  const fallback: CharlieVariant = {
    is_thread: false,
    title: '',
    body: '',
    segments: [],
    charlie_note: 'Generation failed.',
  };
  const response = await charlie.generate([{ role: 'user', content: buildCharliePrompt(ctx, instruction) }], {
    requestContext: stepRequestContext('variant.generate_copy'),
    structuredOutput: {
      schema: charlieVariantSchema,
      errorStrategy: 'fallback',
      fallbackValue: fallback,
    },
  });
  return charlieVariantSchema.parse(response.object ?? fallback);
}

async function classifyVariant(ctx: VariantContext, draft: CharlieVariant): Promise<LexVerdict> {
  const keys = ctx.disclaimerSnippets.map((s) => s.key);
  // Fail-safe: if Lex is unavailable, default to general_advice + a disclaimer
  // (the conservative verdict) rather than silently clearing the copy.
  const fallbackKey =
    ctx.disclaimerSnippets.find((s) => s.key === 'general_advice_warning')?.key ??
    ctx.disclaimerSnippets[0]?.key ??
    null;
  const fallback: LexVerdict = {
    classification: 'general_advice',
    needs_disclaimer: fallbackKey !== null,
    disclaimer_key: fallbackKey,
    rationale: 'Compliance check unavailable — defaulting to general advice with a disclaimer (fail-safe).',
  };
  const response = await lex.generate([{ role: 'user', content: buildLexPrompt(draft, keys) }], {
    requestContext: stepRequestContext('variant.compliance_check'),
    structuredOutput: {
      schema: lexVerdictSchema,
      errorStrategy: 'fallback',
      fallbackValue: fallback,
    },
  });
  return lexVerdictSchema.parse(response.object ?? fallback);
}

// ── Persistence (insert on first pass, update on regeneration) ────────────────

async function logVariantActivity(
  ctx: VariantContext,
  draft: CharlieVariant,
  verdict: LexVerdict,
  contentItemId: string,
  runId: string | undefined,
  phase: 'proposed' | 'approved',
): Promise<void> {
  const status = phase === 'approved' ? 'approved' : 'pending';
  const rows = [
    {
      agent_name: 'charlie',
      action: 'variant_generated',
      status,
      trigger_type: 'manual',
      workflow_run_id: runId ?? null,
      entity_type: 'content_item',
      entity_id: contentItemId,
      proposed_actions: [{ type: 'variant', platform: ctx.platform, is_thread: isThreadVariant(draft) }],
    },
    {
      agent_name: 'lex',
      action: 'compliance_checked',
      status,
      trigger_type: 'manual',
      workflow_run_id: runId ?? null,
      entity_type: 'content_item',
      entity_id: contentItemId,
      proposed_actions: [
        { type: 'compliance', classification: verdict.classification, needs_disclaimer: verdict.needs_disclaimer },
      ],
    },
  ];
  const { error } = await db.from('agent_activity').insert(rows as never);
  // Audit failures shouldn't sink the run — log and continue.
  if (error) console.error('[variant] agent_activity insert failed:', error.message);
}

async function insertVariant(
  ctx: VariantContext,
  draft: CharlieVariant,
  verdict: LexVerdict,
  runId: string | undefined,
): Promise<string> {
  const row = buildContentItemRow({ ctx, draft, verdict, checkedAt: new Date().toISOString() });
  const { data, error } = await db
    .from('content_items')
    .insert(row as never)
    .select('id')
    .single();
  if (error) throw new Error(`Failed to insert variant content_item: ${error.message}`);
  const contentItemId = (data as { id: string }).id;

  const segments = buildThreadSegmentRows(contentItemId, draft);
  if (segments.length > 0) {
    const { error: segErr } = await db.from('thread_segments').insert(segments as never);
    if (segErr) throw new Error(`Failed to insert thread_segments: ${segErr.message}`);
  }
  await logVariantActivity(ctx, draft, verdict, contentItemId, runId, 'proposed');
  return contentItemId;
}

async function updateVariant(
  contentItemId: string,
  ctx: VariantContext,
  draft: CharlieVariant,
  verdict: LexVerdict,
  runId: string | undefined,
): Promise<void> {
  const row = buildContentItemRow({ ctx, draft, verdict, checkedAt: new Date().toISOString() });
  const { error } = await db
    .from('content_items')
    .update(row as never)
    .eq('id', contentItemId);
  if (error) throw new Error(`Failed to update variant content_item: ${error.message}`);

  // Replace segments wholesale — the regenerated draft may have a different shape.
  const { error: delErr } = await db
    .from('thread_segments')
    .delete()
    .eq('content_item_id', contentItemId);
  if (delErr) throw new Error(`Failed to clear thread_segments: ${delErr.message}`);

  const segments = buildThreadSegmentRows(contentItemId, draft);
  if (segments.length > 0) {
    const { error: segErr } = await db.from('thread_segments').insert(segments as never);
    if (segErr) throw new Error(`Failed to reinsert thread_segments: ${segErr.message}`);
  }
  await logVariantActivity(ctx, draft, verdict, contentItemId, runId, 'proposed');
}

// ── Steps ─────────────────────────────────────────────────────────────────────

const resolveContextStep = createStep({
  id: 'resolve_context',
  inputSchema: variantInputSchema,
  outputSchema: z.object({ ctx: variantContextSchema }),
  execute: async ({ inputData }) => {
    const input = inputData;

    const { data: account, error: accErr } = await db
      .from('social_accounts')
      .select('platform, display_name, voice_profile')
      .eq('id', input.socialAccountId)
      .single();
    if (accErr || !account) {
      throw new Error(`social_account ${input.socialAccountId} not found: ${accErr?.message ?? 'missing'}`);
    }
    const acc = account as { platform: Platform; display_name: string | null };
    const platform = acc.platform;

    const { data: beat, error: beatErr } = await db
      .from('campaign_beats')
      .select('id, core_message, title, rationale, prefer_thread')
      .eq('id', input.beatId)
      .single();
    if (beatErr || !beat) {
      throw new Error(`campaign_beat ${input.beatId} not found: ${beatErr?.message ?? 'missing'}`);
    }
    const b = beat as {
      id: string;
      core_message: string;
      title: string | null;
      rationale: string | null;
      prefer_thread: boolean | null;
    };

    const { data: campaign } = await db
      .from('campaigns')
      .select('strategy')
      .eq('id', input.campaignId)
      .maybeSingle();
    const strategy = ((campaign as { strategy?: Record<string, unknown> } | null)?.strategy ?? {}) as Record<
      string,
      unknown
    >;

    const { data: spec, error: specErr } = await db
      .from('platform_specs')
      .select('platform, max_chars, premium_max_chars, max_thread_segments, max_images_per_post, hashtag_guidance')
      .eq('platform', platform)
      .single();
    if (specErr || !spec) {
      throw new Error(`platform_specs for ${platform} not found: ${specErr?.message ?? 'missing'}`);
    }

    const { data: snippets } = await db
      .from('compliance_snippets')
      .select('id, key')
      .eq('is_active', true);
    const disclaimerSnippets = ((snippets ?? []) as Array<{ id: string; key: string }>).map((s) => ({
      id: s.id,
      key: s.key,
    }));

    // Voice: merged profile + exemplars retrieved against the beat's core_message.
    const voice = await resolveVoiceContext({
      accountId: input.socialAccountId,
      platform,
      query: b.core_message,
    });

    const ctx = variantContextSchema.parse({
      input,
      platform,
      accountDisplayName: acc.display_name ?? 'BTS',
      voiceBlock: formatResolvedVoice(voice),
      platformSpec: spec,
      strategy,
      beat: {
        id: b.id,
        core_message: b.core_message,
        title: b.title,
        rationale: b.rationale,
        prefer_thread: Boolean(b.prefer_thread),
      },
      disclaimerSnippets,
    });
    return { ctx };
  },
});

const generateStep = createStep({
  id: 'generate_copy',
  inputSchema: z.object({ ctx: variantContextSchema }),
  outputSchema: z.object({ ctx: variantContextSchema, draft: charlieVariantSchema }),
  execute: async ({ inputData }) => {
    const { ctx } = inputData;
    const draft = await generateVariant(ctx);
    return { ctx, draft };
  },
});

const complianceStep = createStep({
  id: 'compliance_check',
  inputSchema: z.object({ ctx: variantContextSchema, draft: charlieVariantSchema }),
  outputSchema: z.object({ ctx: variantContextSchema, draft: charlieVariantSchema, verdict: lexVerdictSchema }),
  execute: async ({ inputData }) => {
    const { ctx, draft } = inputData;
    const verdict = await classifyVariant(ctx, draft);
    return { ctx, draft, verdict };
  },
});

const persistStep = createStep({
  id: 'persist',
  inputSchema: z.object({ ctx: variantContextSchema, draft: charlieVariantSchema, verdict: lexVerdictSchema }),
  outputSchema: z.object({
    ctx: variantContextSchema,
    draft: charlieVariantSchema,
    verdict: lexVerdictSchema,
    contentItemId: z.string(),
  }),
  execute: async ({ inputData, runId }) => {
    const { ctx, draft, verdict } = inputData;
    const contentItemId = await insertVariant(ctx, draft, verdict, runId);
    return { ctx, draft, verdict, contentItemId };
  },
});

const gateStep = createStep({
  id: 'gate3',
  inputSchema: z.object({
    ctx: variantContextSchema,
    draft: charlieVariantSchema,
    verdict: lexVerdictSchema,
    contentItemId: z.string(),
  }),
  resumeSchema: variantGateResumeSchema,
  suspendSchema: variantGateSuspendSchema,
  stateSchema: variantStateSchema,
  outputSchema: variantResultSchema,
  execute: async ({ inputData, resumeData, suspend, state, setState, runId }) => {
    const { ctx, contentItemId } = inputData;
    // A resumed step re-runs from the top; the latest regenerated draft lives in
    // state, not local vars. Fall back to the freshly persisted draft first pass.
    // Re-parse the state copy so it carries the resolved (non-optional) type.
    let draft: CharlieVariant = state?.working
      ? charlieVariantSchema.parse(state.working.draft)
      : inputData.draft;
    let verdict: LexVerdict = state?.working
      ? lexVerdictSchema.parse(state.working.verdict)
      : inputData.verdict;

    const charCount = (): number =>
      isThreadVariant(draft) ? charCountOf(variantCopyText(draft)) : charCountOf(draft.body);

    const result = (status: 'approved' | 'suspended'): VariantResult => ({
      contentItemId,
      status,
      isThread: isThreadVariant(draft),
      classification: verdict.classification,
      needsDisclaimer: verdict.needs_disclaimer,
      charCount: charCount(),
    });

    const gatePayload = () => ({
      gate: 'gate3' as const,
      contentItemId,
      preview: {
        platform: ctx.platform,
        accountName: ctx.accountDisplayName,
        isThread: isThreadVariant(draft),
        title: draft.title,
        body: draft.body,
        segments: draft.segments.map((s) => s.body),
        charCount: charCount(),
        charLimit: ctx.platformSpec.max_chars,
        classification: verdict.classification,
        needsDisclaimer: verdict.needs_disclaimer,
        disclaimerKey: verdict.disclaimer_key,
        rationale: verdict.rationale,
      },
    });

    // Persist the gate context so the variant editor can render the suspended
    // variant, and the run id so the web decision can resume it. Mirrors how the
    // newsletter run persists gate_message on suspend. Then suspend.
    const suspendAtGate = async () => {
      const payload = gatePayload();
      await db
        .from('content_items')
        .update({ workflow_run_id: runId ?? null, gate_state: payload, pending_decision: null } as never)
        .eq('id', contentItemId);
      await suspend(payload);
    };

    if (!resumeData) {
      await suspendAtGate();
      return result('suspended');
    }

    if (resumeData.decision === 'request_change') {
      // Regenerate THIS variant only — re-run Charlie ▸ Lex, update the same row.
      draft = await generateVariant(ctx, resumeData.instruction);
      verdict = await classifyVariant(ctx, draft);
      await updateVariant(contentItemId, ctx, draft, verdict, runId);
      await setState({ working: { draft, verdict } });
      await suspendAtGate();
      return result('suspended');
    }

    // approve — clear the gate context so the variant leaves the editor queue.
    const { error } = await db
      .from('content_items')
      .update({
        status: 'approved',
        approved_by: resumeData.approvedBy ?? null,
        approved_at: new Date().toISOString(),
        gate_state: null,
        pending_decision: null,
      } as never)
      .eq('id', contentItemId);
    if (error) throw new Error(`Failed to approve variant: ${error.message}`);
    await logVariantActivity(ctx, draft, verdict, contentItemId, runId, 'approved');
    return result('approved');
  },
});

export const variantWorkflow = createWorkflow({
  id: 'variant',
  inputSchema: variantInputSchema,
  stateSchema: variantStateSchema,
  outputSchema: variantResultSchema,
})
  .then(resolveContextStep)
  .then(generateStep)
  .then(complianceStep)
  .then(persistStep)
  .then(gateStep)
  .commit();
