import { supabase } from '@platform/db';
import {
  gate1ResumeSchema,
  gate2ResumeSchema,
  type Gate1Resume,
  type Gate2Resume,
} from './schemas.js';

// Launch + resume orchestration for the Campaign Strategy workflow. The workflow
// steps stay pure; this module owns the side effects: creating the Mastra run and
// driving resumes. The workflow has TWO suspendable steps (gate1, gate2), so —
// unlike the single-gate variant workflow — resume() must name the target step,
// and we reconcile against the persisted snapshot like the newsletter does.

// mastra/index has top-level side effects (boots the server + listeners). Import
// it lazily so this module — and the web-gate listener that imports it — don't
// drag those into unrelated module loads. Mirrors startNewsletterRun.
async function loadMastra() {
  return (await import('../../mastra/index.js')).mastra;
}

// campaigns gate columns aren't in the generated Database types until types are
// regenerated post-migration. Cast at the boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type GateStepId = 'gate1' | 'gate2';

interface RunResult {
  status: string;
}

/** Validate a web-submitted decision against the schema for a given gate. Pure —
 *  returns null for a payload that doesn't match, so it can be unit-tested. */
export function validateStrategyDecision(
  step: GateStepId,
  decision: unknown,
): Gate1Resume | Gate2Resume | null {
  if (step === 'gate1') {
    const parsed = gate1ResumeSchema.safeParse(decision);
    return parsed.success ? parsed.data : null;
  }
  const parsed = gate2ResumeSchema.safeParse(decision);
  return parsed.success ? parsed.data : null;
}

/** Start a brand-new strategy run for a campaign. Resolves once the workflow
 *  hits Gate 1 (which persists gate_state + workflow_run_id on the campaign). */
export async function startStrategyRun(args: {
  campaignId: string;
}): Promise<{ runId: string; status: string }> {
  const { campaignId } = args;
  const mastra = await loadMastra();
  const workflow = mastra.getWorkflow('strategy');
  const run = await workflow.createRun();
  const result = (await run.start({
    inputData: { campaignId },
    initialState: {},
  })) as unknown as RunResult;
  return { runId: run.runId, status: result.status };
}

/**
 * Read the gate the Mastra snapshot is actually suspended on — the source of
 * truth for resume targeting. The campaign's gate_state is only a mirror (it
 * lives in Supabase; the snapshot lives in MASTRA_DB) and the two can drift if a
 * resume is interrupted or the server redeploys mid-advance. Returns null when
 * the run isn't suspended at a gate. Exported for testing.
 */
export async function inspectSuspendedGate(runId: string): Promise<GateStepId | null> {
  const mastra = await loadMastra();
  const workflow = mastra.getWorkflow('strategy');
  const state = await workflow.getWorkflowRunById(runId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const steps = ((state as any)?.steps ?? {}) as Record<string, unknown>;
  for (const id of ['gate1', 'gate2'] as const) {
    const entry = steps[id];
    const last = Array.isArray(entry) ? entry[entry.length - 1] : entry;
    if ((last as { status?: string } | undefined)?.status === 'suspended') return id;
  }
  return null;
}

/** Resume a suspended strategy run at the given gate with a validated decision. */
export async function resumeStrategyRun(args: {
  runId: string;
  step: GateStepId;
  resumeData: Gate1Resume | Gate2Resume;
}): Promise<{ status: string }> {
  const { runId, step, resumeData } = args;

  // The Mastra snapshot — not the campaign row's gate_state — is authoritative
  // for which gate is suspended. If the row has drifted, resuming the wrong step
  // throws "step X was not suspended" and wedges the run. Reconcile instead.
  const actualStep = await inspectSuspendedGate(runId);
  if (!actualStep) {
    console.warn('[strategy] Resume requested but run is not suspended at a gate:', runId);
    return { status: 'not_suspended' };
  }
  if (actualStep !== step) {
    console.warn(
      `[strategy] Gate drift on ${runId}: row expected ${step}, snapshot is at ${actualStep}. Discarding the ${step} decision.`,
    );
    // Clear the stale pending_decision; the founder re-decides against the real gate.
    await db.from('campaigns').update({ pending_decision: null } as never).eq('workflow_run_id', runId);
    return { status: `reconciled_${actualStep}` };
  }

  const mastra = await loadMastra();
  const workflow = mastra.getWorkflow('strategy');
  const run = await workflow.createRun({ runId });
  const result = (await run.resume({
    step,
    resumeData: resumeData as never,
  })) as unknown as RunResult;
  return { status: result.status };
}
