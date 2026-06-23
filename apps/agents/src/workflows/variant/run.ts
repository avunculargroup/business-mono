import { variantGateResumeSchema, type VariantGateResume, type VariantInput } from './schemas.js';

// Resume orchestration for the Variant Generation workflow. The workflow has a
// single suspendable step (gate3), so resume targeting is unambiguous — no
// gate-drift reconciliation like the newsletter (which has two gates). The gate
// step itself owns all content_items persistence (gate_state on suspend, cleared
// on approve); this helper just drives the Mastra resume.

// mastra/index has top-level side effects (boots the server + listeners).
// Import it lazily so this module — and the web-gate listener that imports it —
// don't drag those into unrelated module loads. Mirrors startNewsletterRun.
async function loadMastra() {
  return (await import('../../mastra/index.js')).mastra;
}

interface VariantRunResult {
  status: string;
  result?: { contentItemId?: string };
}

/** Start a brand-new variant run for one (beat × account). Resolves once the
 *  run suspends at Gate 3 (having generated copy, run compliance, persisted the
 *  content_item draft + gate_state). Returns the new content_item id so the
 *  caller (campaign fan-out) can stamp its scheduled_for. */
export async function startVariantRun(
  input: VariantInput,
): Promise<{ runId: string; status: string; contentItemId: string | null }> {
  const mastra = await loadMastra();
  const workflow = mastra.getWorkflow('variant');
  const run = await workflow.createRun();
  const result = (await run.start({
    inputData: input,
    initialState: {},
  })) as unknown as VariantRunResult;
  return {
    runId: run.runId,
    status: result.status,
    contentItemId: result.result?.contentItemId ?? null,
  };
}

/** Validate a web-submitted decision against the gate resume schema. Pure —
 *  returns null for a payload that doesn't match, so it can be unit-tested. */
export function validateVariantDecision(decision: unknown): VariantGateResume | null {
  const parsed = variantGateResumeSchema.safeParse(decision);
  return parsed.success ? parsed.data : null;
}

/** Resume a suspended variant run at Gate 3 with a validated decision. */
export async function resumeVariantRun(args: {
  runId: string;
  resumeData: VariantGateResume;
}): Promise<{ status: string }> {
  const { runId, resumeData } = args;
  const mastra = await loadMastra();
  const workflow = mastra.getWorkflow('variant');
  const run = await workflow.createRun({ runId });
  const result = (await run.resume({
    step: 'gate3',
    resumeData: resumeData as never,
  })) as unknown as { status: string };
  return { status: result.status };
}
