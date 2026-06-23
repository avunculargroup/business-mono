import { variantGateResumeSchema, type VariantGateResume } from './schemas.js';

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
