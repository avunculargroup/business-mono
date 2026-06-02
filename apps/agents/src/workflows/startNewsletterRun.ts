import { SignalClient, type SendMessageParams } from '@platform/signal';
import { supabase } from '@platform/db';
import { buildConfirmationMessage } from './newsletter/messages.js';
import { newsletterInputSchema, type NewsletterInput } from './newsletter/schemas.js';

// mastra/index has top-level side effects (it boots the agent server and starts
// the realtime/polling listeners). Importing it eagerly here would drag those
// into every module that imports startNewsletterRun (Simon's tools, the routine
// workflow) — and into their unit tests. Load it lazily at call time instead.
// (Returned inline rather than via a helper: the workflow object exposes a
// `.then()` builder method, which trips TS's async-return thenable check.)
async function loadMastra() {
  return (await import('../mastra/index.js')).mastra;
}

// Launch + resume orchestration for the newsletter workflow. The workflow steps
// stay pure; this module owns the side effects: sending the gate Signal
// messages and managing the newsletter_runs lifecycle row. Used by Simon's
// start_newsletter tool, the routine handler, and the Signal gate-resume path.

const client = new SignalClient();

/**
 * Send a Signal notification best-effort. Gate prompts and confirmations are
 * notifications, not the system of record — the workflow is already
 * suspended/persisted and resumable from /content. A send failure (e.g. an
 * unregistered recipient returning a 400) must never abort run handling or mark
 * the run errored. Exported for unit testing.
 */
export async function notifySignal(params: SendMessageParams): Promise<void> {
  try {
    await client.sendMessage(params);
  } catch (err) {
    console.warn('[newsletter] Signal notification failed (continuing):', err);
  }
}

// newsletter_runs isn't in the generated Database types until types are
// regenerated post-migration. Cast at the boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (table: string) => any };
const db = supabase as unknown as AnyClient;

const PLATFORM_URL = process.env['PLATFORM_URL'] ?? '';

interface RunResult {
  status: 'suspended' | 'success' | 'failed' | 'canceled' | string;
  suspendPayload?: unknown;
  suspended?: string[][];
  steps?: Record<string, { suspendPayload?: unknown }>;
  result?: {
    contentItemId: string;
    title: string;
    storyCount: number;
    totalWordCount: number;
    editorialScores: Record<string, number>;
  };
  error?: unknown;
}

interface GatePayload {
  gate: 'gate1' | 'gate2';
  message: string;
  newsletterMarkdown?: string;
  held?: boolean;
}

type SuspendedStatus = 'suspended_gate1' | 'suspended_gate2' | 'suspended_hold';

/** The newsletter_runs.status that mirrors a given suspend payload. Shared by
 *  the run-result handler and the snapshot reconciler so both stay in lockstep. */
function statusForGatePayload(payload: GatePayload): SuspendedStatus {
  if (payload.gate === 'gate1') return 'suspended_gate1';
  return payload.held ? 'suspended_hold' : 'suspended_gate2';
}

/** First team member with a Signal number — the default approver for scheduled runs. */
async function defaultApproverSignal(): Promise<string | null> {
  const { data } = await supabase
    .from('team_members')
    .select('signal_number')
    .not('signal_number', 'is', null)
    .limit(1)
    .maybeSingle();
  return (data?.signal_number as string | null) ?? null;
}

function extractSuspendPayload(result: RunResult): GatePayload | null {
  // WorkflowResult exposes the suspending step's payload at the top level; fall
  // back to digging it out of the suspended step's result if absent.
  if (result.suspendPayload) return result.suspendPayload as GatePayload;
  const path = result.suspended?.[0];
  if (!path || path.length === 0) return null;
  const stepId = path[path.length - 1];
  const payload = stepId ? result.steps?.[stepId]?.suspendPayload : undefined;
  return (payload as GatePayload | undefined) ?? null;
}

/**
 * React to a start()/resume() result: send the appropriate Signal message and
 * advance the newsletter_runs row. Shared by launch and resume so the gate
 * messaging is identical on every transition.
 */
async function handleRunResult(args: {
  runId: string;
  result: RunResult;
  signalNumber: string | null;
}): Promise<void> {
  const { runId, result, signalNumber } = args;

  if (result.status === 'suspended') {
    const payload = extractSuspendPayload(result);
    if (!payload) {
      console.error('[newsletter] Suspended run has no gate payload', runId);
      return;
    }
    const status = statusForGatePayload(payload);

    // Persist the gate context so the /content page can render the decision
    // (Signal only ever got the message string + a markdown attachment). Clear
    // any prior pending_decision so the claim that triggered this resume can't
    // be re-processed against the freshly suspended state.
    await db
      .from('newsletter_runs')
      .update({
        status,
        gate_message: payload.message,
        gate_draft_markdown: payload.newsletterMarkdown ?? null,
        pending_decision: null,
      })
      .eq('workflow_run_id', runId);

    if (signalNumber) {
      const attachments =
        payload.gate === 'gate2' && payload.newsletterMarkdown
          ? [
              `data:text/markdown;filename=newsletter.md;base64,${Buffer.from(
                payload.newsletterMarkdown,
                'utf-8',
              ).toString('base64')}`,
            ]
          : undefined;
      await notifySignal({ recipients: [signalNumber], message: payload.message, attachments });
    }
    return;
  }

  if (result.status === 'success' && result.result) {
    const { contentItemId, title, storyCount, totalWordCount, editorialScores } = result.result;
    await db
      .from('newsletter_runs')
      .update({
        status: 'completed',
        content_item_id: contentItemId,
        total_word_count: totalWordCount,
        editorial_scores: editorialScores,
        completed_at: new Date().toISOString(),
        gate_message: null,
        gate_draft_markdown: null,
        pending_decision: null,
      })
      .eq('workflow_run_id', runId);

    if (signalNumber) {
      await notifySignal({
        recipients: [signalNumber],
        message: buildConfirmationMessage({
          title,
          storyCount,
          totalWordCount,
          hqUrl: PLATFORM_URL,
          contentItemId,
        }),
      });
    }
    return;
  }

  if (result.status === 'failed' || result.status === 'canceled') {
    await db
      .from('newsletter_runs')
      .update({
        status: 'failed',
        notes: String(result.error ?? result.status),
        pending_decision: null,
      })
      .eq('workflow_run_id', runId);
    if (signalNumber) {
      await notifySignal({
        recipients: [signalNumber],
        message: "I hit a problem putting the newsletter together and couldn't finish it. Try again when you're ready.",
      });
    }
  }
}

/** Start a brand-new newsletter run. Resolves once the workflow hits gate 1. */
export async function startNewsletterRun(
  rawInput: Partial<NewsletterInput>,
): Promise<{ runId: string; status: string }> {
  const input = newsletterInputSchema.parse(rawInput);
  const signalNumber = input.requestedBySignal ?? (await defaultApproverSignal());

  const mastra = await loadMastra();
  const workflow = mastra.getWorkflow('newsletter');
  const run = await workflow.createRun();
  const runId = run.runId;

  await db.from('newsletter_runs').insert({
    workflow_run_id: runId,
    trigger_source: input.triggerSource,
    time_range: input.timeRange,
    story_count_target: input.storyCount,
    word_count_target: input.targetWordCount,
    audience_context: input.audienceContext ?? null,
    requested_by: input.requestedBy ?? null,
    requested_by_signal: signalNumber,
    status: 'running',
  });

  const result = (await run.start({
    inputData: { ...input, requestedBySignal: signalNumber ?? undefined },
    initialState: {},
  })) as unknown as RunResult;
  await handleRunResult({ runId, result, signalNumber });
  return { runId, status: result.status };
}

/** Workflow step id to resume for a given suspended status. The newsletter
 *  workflow has two suspendable steps (gate1, gate2), so resume() must name the
 *  target step — omitting it makes Mastra fall back to the first step with a
 *  resumeSchema (gate1) and reject a gate-2 payload (publish/revise/hold)
 *  against gate-1's approve/adjust enum. gate2 and hold both re-enter gate2. */
export type GateStepId = 'gate1' | 'gate2';
export function gateStepForStatus(status: string): GateStepId {
  return status === 'suspended_gate1' ? 'gate1' : 'gate2';
}

/**
 * Read the gate the Mastra workflow snapshot is actually suspended on — the
 * source of truth for resume targeting. newsletter_runs.status is only a mirror
 * (it lives in Supabase; the snapshot lives in MASTRA_DB) and the two can drift
 * apart when a resume is interrupted or the server redeploys mid-advance. Uses
 * getWorkflowRunById (present across Mastra versions) and inspects the persisted
 * per-step status. Returns null when the run isn't suspended at a gate (or its
 * snapshot isn't persisted). Exported for testing.
 */
export async function inspectSuspendedGate(runId: string): Promise<GateStepId | null> {
  const mastra = await loadMastra();
  const workflow = mastra.getWorkflow('newsletter');
  const state = await workflow.getWorkflowRunById(runId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const steps = ((state as any)?.steps ?? {}) as Record<string, unknown>;
  for (const id of ['gate1', 'gate2'] as const) {
    const entry = steps[id];
    // A foreach step would be an array; the gates aren't, but handle both.
    const last = Array.isArray(entry) ? entry[entry.length - 1] : entry;
    if ((last as { status?: string } | undefined)?.status === 'suspended') return id;
  }
  return null;
}

/**
 * Re-sync a drifted newsletter_runs row so the /content page renders the gate
 * the run is really suspended at. The stale gate message/draft are cleared — we
 * can't rebuild the earlier gate's prompt from the snapshot, and the page drives
 * its controls off status alone — so the director re-decides against the correct
 * gate (re-approving gate 1 regenerates the draft and the gate-2 context).
 */
async function reconcileRowToGate(runId: string, gate: GateStepId): Promise<void> {
  await db
    .from('newsletter_runs')
    .update({
      status: gate === 'gate1' ? 'suspended_gate1' : 'suspended_gate2',
      gate_message: null,
      gate_draft_markdown: null,
      pending_decision: null,
    })
    .eq('workflow_run_id', runId);
}

/** Resume a suspended run (gate reply from Signal or the /content page). */
export async function resumeNewsletterRun(args: {
  runId: string;
  resumeData: unknown;
  step: GateStepId;
}): Promise<{ status: string }> {
  const { runId, resumeData, step } = args;

  const { data: row } = await db
    .from('newsletter_runs')
    .select('requested_by_signal')
    .eq('workflow_run_id', runId)
    .maybeSingle();
  const signalNumber = (row?.requested_by_signal as string | null) ?? null;

  // Mastra's snapshot — not newsletter_runs.status — is authoritative for which
  // gate is suspended. If the row has drifted ahead of (or behind) the snapshot,
  // resuming the row's step throws "step X was not suspended" and wedges the run.
  // Reconcile the row to the snapshot instead of resuming a payload the real gate
  // can't accept; the director then re-decides against the correct gate.
  const actualStep = await inspectSuspendedGate(runId);
  if (!actualStep) {
    console.warn('[newsletter] Resume requested but run is not suspended at a gate:', runId);
    return { status: 'not_suspended' };
  }
  if (actualStep !== step) {
    console.warn(
      `[newsletter] Gate drift on ${runId}: row expected ${step}, snapshot is at ${actualStep}. Reconciling the row and discarding the ${step} decision.`,
    );
    await reconcileRowToGate(runId, actualStep);
    return { status: `reconciled_${actualStep}` };
  }

  const mastra = await loadMastra();
  const workflow = mastra.getWorkflow('newsletter');
  const run = await workflow.createRun({ runId });
  const result = (await run.resume({
    step,
    resumeData: resumeData as never,
  })) as unknown as RunResult;
  await handleRunResult({ runId, result, signalNumber });
  return { status: result.status };
}
