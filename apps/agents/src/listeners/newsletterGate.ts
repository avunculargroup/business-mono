import { supabase } from '@platform/db';
import { resumeNewsletterRun } from '../workflows/startNewsletterRun.js';
import type { Gate1Resume, Gate2Resume } from '../workflows/newsletter/schemas.js';

// Routing + intent parsing for human replies at the newsletter Signal gates.
// The parser is pure and deterministic (these are short, command-like replies —
// regex is more reliable here than an LLM) so it can be unit-tested. The
// listener calls findSuspendedRun() before handing a message to Simon.

export type SuspendedGate = 'suspended_gate1' | 'suspended_gate2' | 'suspended_hold';

export interface SuspendedRun {
  runId: string;
  status: SuspendedGate;
}

// Word-based matchers use \b to avoid matching inside a longer word; the 👍
// emoji is checked separately because it has no word boundary.
const APPROVE_RE = /^\s*(go|approve|approved|looks good|yes|ok|okay|ship it)\b/i;
const PUBLISH_RE = /^\s*(publish|approve|approved|send it|ship it|looks good)\b/i;
const HOLD_RE = /^\s*(hold|pause|wait|not yet)\b/i;
const REVISE_RE = /^\s*revise\s+(\d+)\s*[:\-]?\s*(.+)$/is;
const THUMBS_UP = '👍';

/** Parse a gate-1 (story selection) reply. Anything that isn't an approval is an adjustment. */
export function parseGate1Reply(text: string): Gate1Resume {
  if (APPROVE_RE.test(text) || text.includes(THUMBS_UP)) return { decision: 'approve' };
  return { decision: 'adjust', adjustment: text.trim() };
}

/** Parse a gate-2 (final draft) reply into publish / revise / hold. */
export function parseGate2Reply(text: string): Gate2Resume {
  const revise = REVISE_RE.exec(text);
  if (revise) {
    return {
      decision: 'revise',
      storyNumber: Number.parseInt(revise[1] ?? '', 10),
      instruction: (revise[2] ?? '').trim(),
    };
  }
  if (HOLD_RE.test(text)) return { decision: 'hold' };
  if (PUBLISH_RE.test(text) || text.includes(THUMBS_UP)) return { decision: 'publish' };
  // Ambiguous gate-2 reply — default to hold so nothing is published by accident.
  return { decision: 'hold' };
}

/**
 * Find a newsletter run currently suspended at a gate for this Signal sender.
 * Returns the most recent match, or null when the sender has no pending gate
 * (so the message falls through to normal Simon handling).
 */
export async function findSuspendedRun(senderNumber: string): Promise<SuspendedRun | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as { from: (t: string) => any };
  const { data } = await db
    .from('newsletter_runs')
    .select('workflow_run_id, status')
    .eq('requested_by_signal', senderNumber)
    .in('status', ['suspended_gate1', 'suspended_gate2', 'suspended_hold'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { runId: data.workflow_run_id as string, status: data.status as SuspendedGate };
}

/**
 * Resume a suspended run from a Signal reply. Returns a short acknowledgement to
 * send back to the sender, or null if the run couldn't be resumed.
 */
export async function resumeFromReply(run: SuspendedRun, text: string): Promise<string> {
  if (run.status === 'suspended_gate1') {
    const resumeData = parseGate1Reply(text);
    await resumeNewsletterRun({ runId: run.runId, resumeData });
    return resumeData.decision === 'approve'
      ? 'Approved — drafting the stories now. I\'ll send the full draft for review shortly.'
      : 'Got it — reworking the shortlist and I\'ll send the updated draft through.';
  }

  // gate2 or hold both accept the gate-2 command set.
  const resumeData = parseGate2Reply(text);
  await resumeNewsletterRun({ runId: run.runId, resumeData });
  switch (resumeData.decision) {
    case 'publish':
      return 'Publishing — saving it to the content pipeline now.';
    case 'revise':
      return `On it — revising story ${resumeData.storyNumber} and I\'ll resend the draft.`;
    case 'hold':
    default:
      return 'Holding the newsletter — message me when you want to pick it back up.';
  }
}
