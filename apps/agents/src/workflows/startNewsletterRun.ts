import { SignalClient, type SendMessageParams } from '@platform/signal';
import { supabase } from '@platform/db';
import { isKeyLimitError } from '../lib/llmErrors.js';
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

interface CompletedResult {
  contentItemId: string;
  title: string;
  storyCount: number;
  totalWordCount: number;
  editorialScores: Record<string, number>;
}

interface NoStoriesResult {
  noStories: true;
  reason: string;
  timeRange: string;
  candidatesFound: number;
}

interface RunResult {
  status: 'suspended' | 'success' | 'failed' | 'canceled' | 'bailed' | string;
  suspendPayload?: unknown;
  suspended?: string[][];
  steps?: Record<string, { suspendPayload?: unknown }>;
  result?: CompletedResult | NoStoriesResult;
  error?: unknown;
}

function isNoStories(result: CompletedResult | NoStoriesResult | undefined): result is NoStoriesResult {
  return Boolean(result && 'noStories' in result && result.noStories);
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

/**
 * Resolve which gate a suspended run is at, plus its message/draft, from a
 * WorkflowResult. The suspended *step id* (result.suspended) — not a `gate`
 * field on the suspend payload — is authoritative: some Mastra runtime/version
 * combos surface an empty or mis-shaped top-level `suspendPayload`, which made
 * every gate read as gate 2 with a null message (so gate-1 prompts never
 * persisted and gate-2 resumes targeted the wrong step). Read the gate from the
 * path, then take the message/markdown/held from whichever payload location
 * actually carries them (per-step record preferred over the top-level field).
 * Exported for testing.
 */
export function extractSuspendPayload(result: RunResult): GatePayload | null {
  const path = result.suspended?.[0];
  const stepId = path && path.length > 0 ? path[path.length - 1] : undefined;
  if (stepId !== 'gate1' && stepId !== 'gate2') return null;
  const top = (result.suspendPayload ?? {}) as Partial<GatePayload>;
  const step = (result.steps?.[stepId]?.suspendPayload ?? {}) as Partial<GatePayload>;
  const merged: Partial<GatePayload> = { ...top, ...step };
  return {
    gate: stepId,
    message: merged.message ?? '',
    newsletterMarkdown: merged.newsletterMarkdown,
    held: merged.held,
  };
}

/**
 * React to a start()/resume() result: send the appropriate Signal message and
 * advance the newsletter_runs row. Shared by launch and resume so the gate
 * messaging is identical on every transition.
 */
export async function handleRunResult(args: {
  runId: string;
  result: RunResult;
  signalNumber: string | null;
}): Promise<void> {
  const { runId, result, signalNumber } = args;

  // No-stories runs bail before any gate (status 'success' or 'bailed' depending
  // on the Mastra engine path), carrying a diagnostic reason instead of a draft.
  // There's nothing to approve, so end the run and tell the director why.
  if (isNoStories(result.result)) {
    const { reason } = result.result;
    await db
      .from('newsletter_runs')
      .update({
        status: 'no_stories',
        notes: reason,
        gate_message: reason,
        gate_draft_markdown: null,
        pending_decision: null,
        completed_at: new Date().toISOString(),
      })
      .eq('workflow_run_id', runId);
    if (signalNumber) {
      await notifySignal({ recipients: [signalNumber], message: reason });
    }
    return;
  }

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
    // isNoStories returned above, so a successful result is the persisted shape.
    const { contentItemId, title, storyCount, totalWordCount, editorialScores } =
      result.result as CompletedResult;
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
    // A key/credit-limit rejection is an operational problem, not a transient
    // glitch — say so plainly so the director knows retrying won't help until
    // the provider quota is sorted.
    const keyLimit = isKeyLimitError(result.error);
    const notes = keyLimit
      ? "AI provider usage limit reached — the newsletter couldn't be generated."
      : String(result.error ?? result.status);
    const message = keyLimit
      ? "I couldn't build the newsletter — the AI provider's usage limit has been reached. It'll need topping up before I can try again."
      : "I hit a problem putting the newsletter together and couldn't finish it. Try again when you're ready.";
    await db
      .from('newsletter_runs')
      .update({
        status: 'failed',
        notes,
        pending_decision: null,
      })
      .eq('workflow_run_id', runId);
    if (signalNumber) {
      await notifySignal({ recipients: [signalNumber], message });
    }
  }
}

/** Start a brand-new newsletter run. Resolves once the workflow hits gate 1, or
 *  immediately with status 'no_stories' (and a reason) when there's nothing to
 *  run — that branch bails before any gate. */
export async function startNewsletterRun(
  rawInput: Partial<NewsletterInput>,
): Promise<{ runId: string; status: string; reason?: string }> {
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
  // Normalise the no-stories bail (engine status 'success'/'bailed') into a
  // stable contract callers can branch on, carrying the diagnostic reason.
  if (isNoStories(result.result)) {
    return { runId, status: 'no_stories', reason: result.result.reason };
  }
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
