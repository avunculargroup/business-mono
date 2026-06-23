import { createRealtimeClient } from '@platform/db';
import { supabase } from '@platform/db';
import { lex } from '../agents/compliance/index.js';
import { stepRequestContext } from '../config/model.js';
import { buildLexPrompt, charCountOf, isThreadVariant, variantCopyText } from '../workflows/variant/prompts.js';
import { complianceStatusFor, resolveDisclaimerSnippetId } from '../workflows/variant/persist.js';
import { lexVerdictSchema, type LexVerdict, type CharlieVariant } from '../workflows/variant/schemas.js';
import { subscribeWithReconnect } from './lib/realtimeChannel.js';

// Compliance re-run on edit (Step 9, application layer — not the workflow). When
// a human edits a campaign variant's copy, the web action sets
// compliance_status = 'pending' and clears compliance_checked_at; this listener
// re-invokes Lex (the variant classifier), resets the compliance fields, and —
// if the variant is still suspended at Gate 3 — patches gate_state.preview so the
// editor reflects the new verdict. A cleared verdict must not survive an edit:
// an edit can reintroduce advice risk. Mirrors the flow-doc's cross-cutting note.

const realtime = createRealtimeClient();

// content_items compliance/gate columns aren't in the generated Database types
// until types are regenerated post-migration. Cast at the boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface DisclaimerRef {
  id: string;
  key: string;
}

export interface RecheckRow {
  id: string;
  campaign_id: string | null;
  is_thread: boolean;
  title: string | null;
  body: string | null;
  compliance_status: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gate_state: any;
}

/** Rebuild a CharlieVariant-shaped draft from the persisted row + its segments,
 *  so the same Lex prompt the workflow used can re-score the edited copy. Pure. */
export function draftFromRow(row: RecheckRow, segmentBodies: string[]): CharlieVariant {
  return {
    is_thread: row.is_thread && segmentBodies.length > 0,
    title: row.title ?? '',
    body: row.body ?? '',
    segments: segmentBodies.map((b) => ({ body: b })),
    charlie_note: '',
  };
}

/** Map Lex's verdict to the content_items compliance columns. Pure. */
export function buildComplianceFields(
  verdict: LexVerdict,
  snippets: DisclaimerRef[],
  checkedAt: string,
): Record<string, unknown> {
  return {
    compliance_status: complianceStatusFor(verdict),
    compliance_classification: verdict.classification,
    needs_disclaimer: verdict.needs_disclaimer,
    disclaimer_snippet_id: resolveDisclaimerSnippetId(verdict, snippets),
    compliance_rationale: verdict.rationale || null,
    compliance_checked_at: checkedAt,
  };
}

/** Patch a suspended Gate 3 preview to reflect the edited copy + new verdict, so
 *  the variant editor shows the current text and compliance chip. Returns null
 *  when the row isn't suspended at a gate (nothing to patch). Pure. */
export function patchGateStatePreview(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gateState: any,
  draft: CharlieVariant,
  verdict: LexVerdict,
): unknown | null {
  if (!gateState?.preview) return null;
  const thread = isThreadVariant(draft);
  const charCount = thread ? charCountOf(variantCopyText(draft)) : charCountOf(draft.body);
  return {
    ...gateState,
    preview: {
      ...gateState.preview,
      isThread: thread,
      title: draft.title,
      body: draft.body,
      segments: draft.segments.map((s) => s.body),
      charCount,
      classification: verdict.classification,
      needsDisclaimer: verdict.needs_disclaimer,
      disclaimerKey: verdict.disclaimer_key,
      rationale: verdict.rationale,
    },
  };
}

async function classify(draft: CharlieVariant, snippets: DisclaimerRef[]): Promise<LexVerdict> {
  const keys = snippets.map((s) => s.key);
  const fallbackKey =
    snippets.find((s) => s.key === 'general_advice_warning')?.key ?? snippets[0]?.key ?? null;
  const fallback: LexVerdict = {
    classification: 'general_advice',
    needs_disclaimer: fallbackKey !== null,
    disclaimer_key: fallbackKey,
    rationale: 'Compliance recheck unavailable — defaulting to general advice with a disclaimer (fail-safe).',
  };
  const response = await lex.generate([{ role: 'user', content: buildLexPrompt(draft, keys) }], {
    requestContext: stepRequestContext('variant.compliance_check'),
    structuredOutput: { schema: lexVerdictSchema, errorStrategy: 'fallback', fallbackValue: fallback },
  });
  return lexVerdictSchema.parse(response.object ?? fallback);
}

/**
 * Re-run compliance for one edited variant. Atomically claims the pending row
 * (compliance_checked_at IS NULL → now) so the listener's own writes and
 * concurrent events can't double-process it, then re-scores and persists.
 * Exported for testing.
 */
export async function handleRecheckRow(row: RecheckRow): Promise<void> {
  if (row.compliance_status !== 'pending' || !row.campaign_id) return;

  // Claim: only the caller that flips compliance_checked_at from NULL proceeds.
  const claimedAt = new Date().toISOString();
  const { data: claimed } = await db
    .from('content_items')
    .update({ compliance_checked_at: claimedAt })
    .eq('id', row.id)
    .eq('compliance_status', 'pending')
    .is('compliance_checked_at', null)
    .select('id');
  if (!claimed || claimed.length === 0) return;

  // Load the thread segments (for a threaded variant) and the active disclaimers.
  let segmentBodies: string[] = [];
  if (row.is_thread) {
    const { data: segs } = await db
      .from('thread_segments')
      .select('body, sequence')
      .eq('content_item_id', row.id)
      .order('sequence', { ascending: true });
    segmentBodies = ((segs ?? []) as Array<{ body: string }>).map((s) => s.body);
  }
  const { data: snippetRows } = await db
    .from('compliance_snippets')
    .select('id, key')
    .eq('is_active', true);
  const snippets = ((snippetRows ?? []) as DisclaimerRef[]).map((s) => ({ id: s.id, key: s.key }));

  const draft = draftFromRow(row, segmentBodies);
  const verdict = await classify(draft, snippets);
  const fields = buildComplianceFields(verdict, snippets, new Date().toISOString());
  const gatePatch = patchGateStatePreview(row.gate_state, draft, verdict);

  const { error } = await db
    .from('content_items')
    .update({ ...fields, ...(gatePatch ? { gate_state: gatePatch } : {}) })
    .eq('id', row.id);
  if (error) console.error('[compliance-recheck] update failed:', error.message);
}

/** Subscribe to content_items and re-run Lex on any variant edit that reset
 *  compliance to pending. */
export function startComplianceRecheckListener(): void {
  subscribeWithReconnect({
    client: realtime,
    channelName: 'compliance-recheck',
    logPrefix: '[compliance-recheck]',
    onSubscribed: () => {
      console.log('[compliance-recheck] Listening for edited variants via Supabase Realtime');
    },
    attachHandlers: (channel) =>
      channel.on(
        'postgres_changes' as never,
        { event: 'UPDATE', schema: 'public', table: 'content_items' },
        async (payload: { new: RecheckRow }) => {
          try {
            await handleRecheckRow(payload.new);
          } catch (err) {
            console.error('[compliance-recheck] Error handling recheck:', err);
          }
        },
      ),
  });
}
