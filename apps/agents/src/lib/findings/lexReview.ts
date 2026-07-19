// Lex review of the findings narration. The mechanical house-style checks
// already ran (houseStyleLinter.ts); Lex only judges what needs reasoning:
// whether a valuation-sensitive finding has been framed as advice rather than
// observation. Reuses the roster `lex` agent and its verdict schema — this is
// the sixth review surface on the same persona, with its own step scope.
//
// Fails CLOSED: an errored review returns a failing verdict, and the pipeline
// withholds the narration (status 'held'). A compliance gate must never fail open.

import { supabase } from '@platform/db';
import type { Json } from '@platform/db';
import type { Finding } from '@platform/shared';
import {
  complianceVerdictSchema,
  lex,
  type ComplianceVerdict,
} from '../../agents/compliance/index.js';
import { stepRequestContext } from '../../config/model.js';
import { createLogger } from '../logger.js';

const log = createLogger('findings-lex');

const FAILSAFE_VERDICT: ComplianceVerdict = {
  passes: false,
  flags: [],
  rationale: 'Compliance review could not be completed — narration withheld from the report email.',
  suggested_rewrite: null,
};

const REVIEW_PREAMBLE = `Review this daily market-report narration for advice risk under AFSL/AR.

The narration was generated ONLY from the findings JSON below; mechanical checks (spelling, exclamation marks, number provenance) have already passed — do not re-do them. Judge FRAMING, especially of the findings marked compliance_class = "valuation_sensitive" (MVRV, Mayer Multiple, RSI, moving-average crosses, Hash Ribbons).

Fail (passes=false) when any of these is true:
- A finding is framed as a recommendation or signal to act (buy, sell, accumulate, take profit, "a signal to…", "time to…").
- A valuation verdict is drawn ("undervalued", "overvalued", "cheap", "expensive", "fair value").
- A metric is presented as predictive of price rather than descriptive of current state.
- A single-period move is stated as a conclusion where the finding has narration_hint.verdict_allowed = false.
- "capitulation"/"recovery" appears without a finding whose allowed_vocab permits it.

Pass when the narration describes what the data did and avoids advice. Hedged, observational framing is expected. Do not rewrite; only judge.`;

/** Run Lex over the narration and its findings. Never throws. */
export async function reviewNarrationForCompliance(input: {
  narration: string;
  findings: Finding[];
}): Promise<ComplianceVerdict> {
  const prompt =
    `${REVIEW_PREAMBLE}\n\n` +
    `NARRATION:\n${input.narration}\n\n` +
    `FINDINGS:\n${JSON.stringify(input.findings, null, 2)}`;
  try {
    const response = await lex.generate([{ role: 'user', content: prompt }], {
      requestContext: stepRequestContext('market_report.compliance_review'),
      structuredOutput: {
        schema: complianceVerdictSchema,
        errorStrategy: 'fallback',
        fallbackValue: FAILSAFE_VERDICT,
      },
    });
    return complianceVerdictSchema.parse(response.object ?? FAILSAFE_VERDICT);
  } catch (err) {
    log.error({ err }, 'Lex narration review failed — failing closed');
    return FAILSAFE_VERDICT;
  }
}

/** Log Lex's verdict to agent_activity against the market_reports row. */
export async function recordNarrationReview(verdict: ComplianceVerdict, reportId: string): Promise<void> {
  const flagSummary = verdict.flags.length
    ? ` Flagged: ${verdict.flags.map((f) => `"${f.quote}" — ${f.issue}`).join('; ')}`
    : '';
  const { error } = await supabase.from('agent_activity').insert({
    agent_name: 'lex',
    action: verdict.passes ? 'Market report narration: passed' : 'Market report narration: withheld',
    // No human approval wall in this pipeline — a failing verdict withholds the
    // narration automatically, so both outcomes are 'auto', on the record.
    status: 'auto',
    trigger_type: 'agent',
    entity_type: 'market_reports',
    entity_id: reportId,
    notes: `${verdict.rationale}${flagSummary}`,
    proposed_actions: (verdict.suggested_rewrite
      ? [{ kind: 'suggested_rewrite', body: verdict.suggested_rewrite }]
      : []) as Json,
  });
  if (error) log.error({ err: error }, 'failed to log Lex narration verdict');
}
