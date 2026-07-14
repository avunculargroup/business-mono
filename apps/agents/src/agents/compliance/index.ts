import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { supabase } from '@platform/db';
import type { Json, Database } from '@platform/db';

type AgentActivityInsert = Database['public']['Tables']['agent_activity']['Insert'];
import { dynamicModelFor, stepRequestContext } from '../../config/model.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('compliance');

// Lex — BTS's compliance reviewer. Unlike the internal newsletter `editor`, Lex
// is a first-class roster persona: its verdicts are logged to agent_activity
// under its OWN name so the AFSL/AR audit trail is meaningful. It is a review
// GATE, not a chat specialist, so it is deliberately NOT registered on Simon's
// `agents:` roster — it is invoked downstream of content drafting (see
// contentCreatorListener) on compliance-sensitive beats. Its model resolves via
// the `content.compliance_review` step scope first, then its own `lex` agent
// scope, then the env default — both configurable from /settings/models.

const COMPLIANCE_SYSTEM_PROMPT = `You are Lex, BTS's compliance reviewer.

## Your role
BTS operates under an Australian Financial Services Licence / Authorised Representative arrangement. You review draft content and decide whether it would, to a regulator, read as PERSONAL FINANCIAL ADVICE, a securities-style buy/sell signal, or a price prediction. You do NOT rewrite for style — that is the Editor's job. You judge advice risk, explain it precisely, and optionally suggest a minimally-changed neutral rewrite.

## The line you are guarding
On-chain valuation metrics are the single highest advice-risk surface on this platform:
- **MVRV** and **realised price** describe where price sits relative to the network's aggregate cost basis. As CONTEXT this is fine ("bitcoin trades above the network's aggregate cost basis"). As a RECOMMENDATION it is a problem ("MVRV says bitcoin is undervalued — a buying opportunity").
- **Hash Ribbons** is a miner capitulation/recovery signal. Stating what the cross IS is fine ("the 30-day hash-rate average crossed back above the 60-day"). Telling the reader what to DO is not ("Hash Ribbons flashed buy").

## FAIL the draft (passes=false) when it does any of these
- Recommends buying, selling, accumulating, taking profit, or timing an entry/exit — explicitly or by clear implication.
- Predicts a future price, or frames a metric as meaning bitcoin is "cheap", "expensive", "undervalued", or "overvalued".
- Presents any metric as a signal to act, rather than as context/evidence.
- Promises or implies a particular financial outcome.

## PASS the draft (passes=true) when
- Metrics are stated as fact or context, the BTS perspective leads, and no action is recommended or implied. General education about how a metric works is fine.

## Output
Return the structured verdict you are given:
- passes: boolean
- flags: each problematic phrase as { quote, issue } — quote the exact words; explain the advice risk in one sentence. Empty when it passes.
- rationale: one or two sentences summarising your decision for the human reviewer.
- suggested_rewrite: only when it fails — a minimally-changed, neutral version that keeps the author's point but removes the advice framing. Null when it passes.

You are advisory: a human still approves every piece. Be precise, not prissy — neutral, evidenced market commentary is allowed; recommendations are not.`;

export const lex = new Agent({
  id: 'lex',
  name: 'lex',
  description:
    'Compliance reviewer. Flags content that frames metrics (especially on-chain valuation: MVRV, realised price, Hash Ribbons) as buy/sell signals or price predictions under AFSL/AR. Advisory gate — never replaces human approval.',
  instructions: COMPLIANCE_SYSTEM_PROMPT,
  model: dynamicModelFor('lex'),
  defaultOptions: { modelSettings: { maxOutputTokens: 4096 } },
});

export const complianceVerdictSchema = z.object({
  passes: z.boolean(),
  flags: z
    .array(z.object({ quote: z.string(), issue: z.string() }))
    .default([]),
  rationale: z.string(),
  suggested_rewrite: z.string().nullable().default(null),
});

export type ComplianceVerdict = z.infer<typeof complianceVerdictSchema>;

// Fail-safe: if the review itself errors, treat it as needing human attention
// rather than silently passing. A compliance gate must never fail open.
const FAILSAFE_VERDICT: ComplianceVerdict = {
  passes: false,
  flags: [],
  rationale: 'Compliance review could not be completed — routing to a human for manual review.',
  suggested_rewrite: null,
};

/** Run Lex over a draft and return the structured verdict. Never throws. */
export async function reviewDraftForCompliance(draft: {
  title: string | null;
  body: string;
}): Promise<ComplianceVerdict> {
  const prompt =
    `Review this draft for advice risk under AFSL/AR.\n\n` +
    `TITLE: ${draft.title ?? '(untitled)'}\n\nBODY:\n${draft.body}`;
  try {
    const response = await lex.generate([{ role: 'user', content: prompt }], {
      requestContext: stepRequestContext('content.compliance_review'),
      structuredOutput: {
        schema: complianceVerdictSchema,
        errorStrategy: 'fallback',
        fallbackValue: FAILSAFE_VERDICT,
      },
    });
    return complianceVerdictSchema.parse(response.object ?? FAILSAFE_VERDICT);
  } catch {
    return FAILSAFE_VERDICT;
  }
}

/** Maps a verdict to the agent_activity row Lex logs. A failing verdict lands as
 *  'pending' (needs a human at the approval wall); a pass lands as 'auto'. */
export function verdictToActivity(
  verdict: ComplianceVerdict,
  input: { contentItemId: string; parentActivityId?: string },
): AgentActivityInsert {
  const flagSummary = verdict.flags.length
    ? ` Flagged: ${verdict.flags.map((f) => `"${f.quote}" — ${f.issue}`).join('; ')}`
    : '';
  return {
    agent_name: 'lex',
    action: verdict.passes ? 'Compliance review: passed' : 'Compliance review: flagged',
    status: verdict.passes ? 'auto' : 'pending',
    trigger_type: 'agent',
    entity_type: 'content_items',
    entity_id: input.contentItemId,
    parent_activity_id: input.parentActivityId ?? null,
    notes: `${verdict.rationale}${flagSummary}`,
    // Surface a neutral rewrite suggestion for the human reviewer, when offered.
    proposed_actions: (verdict.suggested_rewrite
      ? [{ kind: 'suggested_rewrite', body: verdict.suggested_rewrite }]
      : []) as Json,
  };
}

/**
 * Review a freshly-persisted draft and log Lex's verdict to agent_activity. Used
 * by contentCreatorListener for compliance-sensitive beats. The `review` arg is
 * injectable for testing; it defaults to the real Lex call.
 */
export async function recordComplianceReview(
  input: { contentItemId: string; title: string | null; body: string; parentActivityId?: string },
  review: (d: { title: string | null; body: string }) => Promise<ComplianceVerdict> = reviewDraftForCompliance,
): Promise<ComplianceVerdict> {
  const verdict = await review({ title: input.title, body: input.body });
  const { error } = await supabase.from('agent_activity').insert(verdictToActivity(verdict, input));
  if (error) {
    log.error({ error: error.message }, 'failed to log Lex verdict');
  }
  return verdict;
}
