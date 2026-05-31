import { SignalClient } from '@platform/signal';
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
    const status =
      payload.gate === 'gate1'
        ? 'suspended_gate1'
        : payload.held
          ? 'suspended_hold'
          : 'suspended_gate2';

    await db.from('newsletter_runs').update({ status }).eq('workflow_run_id', runId);

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
      await client.sendMessage({ recipients: [signalNumber], message: payload.message, attachments });
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
      })
      .eq('workflow_run_id', runId);

    if (signalNumber) {
      await client.sendMessage({
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
      .update({ status: 'failed', notes: String(result.error ?? result.status) })
      .eq('workflow_run_id', runId);
    if (signalNumber) {
      await client.sendMessage({
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

/** Resume a suspended run (gate reply from Signal). */
export async function resumeNewsletterRun(args: {
  runId: string;
  resumeData: unknown;
}): Promise<{ status: string }> {
  const { runId, resumeData } = args;

  const { data: row } = await db
    .from('newsletter_runs')
    .select('requested_by_signal')
    .eq('workflow_run_id', runId)
    .maybeSingle();
  const signalNumber = (row?.requested_by_signal as string | null) ?? null;

  const mastra = await loadMastra();
  const workflow = mastra.getWorkflow('newsletter');
  const run = await workflow.createRun({ runId });
  const result = (await run.resume({ resumeData: resumeData as never })) as unknown as RunResult;
  await handleRunResult({ runId, result, signalNumber });
  return { status: result.status };
}
