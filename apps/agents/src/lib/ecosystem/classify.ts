// Lex classifies every change at ingest, so the client-promotion gate has its
// answer before anyone asks for it.
//
// For the internal feed this is a LABEL, not a gate: Lex does not suspend the
// scan and directors see everything. It becomes a gate the day a change is
// promoted to a client-facing surface — `flagClientRelevant` in the web app
// already refuses anything not classified `neutral`.
//
// Two rules are enforced in code, not left to the model:
//
//   1. A FLOOR. A regulatory_change is solvency_adjacent at minimum, whatever
//      Lex returns. It is the highest-value signal for a fiduciary and the one
//      most capable of harm if stated loosely, so its gate is not a judgment
//      call. The model may escalate from the floor, never below it.
//   2. FAIL CLOSED. An errored or unparseable classification leaves
//      compliance_class NULL, and NULL is treated exactly as restrictively as
//      advice_adjacent by the promotion gate. A compliance call that did not
//      happen must never read as a clearance.

import { z } from 'zod';
import { EcosystemComplianceClass, type EcosystemComplianceClass as ComplianceClass } from '@platform/shared';
import { lex } from '../../agents/compliance/index.js';
import { stepRequestContext } from '../../config/model.js';
import { createLogger } from '../logger.js';

const log = createLogger('ecosystem-classify');

export const CLASSIFY_SCOPE_KEY = 'ecosystemScan.classify';

const classificationSchema = z.object({
  compliance_class: z.enum([
    'neutral',
    'valuation_adjacent',
    'advice_adjacent',
    'solvency_adjacent',
  ]),
  compliance_notes: z.string(),
});

export interface Classification {
  complianceClass: ComplianceClass;
  complianceNotes: string;
}

// Ordered least to most restrictive, so the floor can be applied by rank.
const RANK: Record<ComplianceClass, number> = {
  neutral: 0,
  valuation_adjacent: 1,
  advice_adjacent: 2,
  solvency_adjacent: 3,
};

/** Minimum class a change type may be classified as, regardless of the model. */
const FLOOR_BY_TYPE: Partial<Record<string, ComplianceClass>> = {
  regulatory_change: EcosystemComplianceClass.SOLVENCY_ADJACENT,
};

/** Apply the code floor. Exported: this is the rule that must not regress. */
export function applyFloor(changeType: string, classified: ComplianceClass): ComplianceClass {
  const floor = FLOOR_BY_TYPE[changeType];
  if (!floor) return classified;
  return RANK[classified] >= RANK[floor] ? classified : floor;
}

const PREAMBLE = `Classify one ecosystem change for compliance risk under Australian AFSL/AR obligations.

The change is a factual observation about a third-party product or service that BTS features. It will appear on an INTERNAL feed now, and may later be promoted to a client-facing surface. Your classification decides whether that promotion needs a human compliance review.

Choose exactly one class:
- "neutral" — a plain product or operational fact with no bearing on value, solvency or a course of action. A firmware release. A documentation update.
- "valuation_adjacent" — touches pricing, fees, or anything a reader could take as bearing on what something is worth.
- "advice_adjacent" — a reader could reasonably read it as a recommendation to act, or it concerns the suitability of a product.
- "solvency_adjacent" — touches the financial standing, custody, registration status, reserves or continuity of a counterparty. This is the most restrictive class.

Judge the CHANGE and its facts, not the wording of any summary. When two classes could apply, choose the more restrictive one — the cost of over-classifying is a human review, and the cost of under-classifying is an unreviewed statement about a counterparty reaching a client.

Keep compliance_notes to one short sentence explaining the choice.

Return ONLY a JSON object matching the requested schema.`;

/**
 * Classify one change. Never throws.
 *
 * Returns null on failure — the caller leaves compliance_class NULL, which the
 * promotion gate refuses. Silence is the safe answer here.
 */
export async function classifyChange(input: {
  changeType: string;
  title: string;
  payload: Record<string, unknown>;
  entityName: string;
}): Promise<Classification | null> {
  const prompt = [
    PREAMBLE,
    '',
    `entity: ${input.entityName}`,
    `change_type: ${input.changeType}`,
    `title: ${input.title}`,
    '',
    `payload:\n${JSON.stringify(input.payload, null, 2)}`,
  ].join('\n');

  try {
    const response = await lex.generate([{ role: 'user', content: prompt }], {
      requestContext: stepRequestContext(CLASSIFY_SCOPE_KEY),
      structuredOutput: {
        schema: classificationSchema,
        errorStrategy: 'fallback',
        fallbackValue: null,
      },
    });

    const parsed = classificationSchema.safeParse(response.object);
    if (!parsed.success) {
      log.warn({ title: input.title }, 'classification unparseable — leaving unclassified');
      return null;
    }

    return {
      complianceClass: applyFloor(input.changeType, parsed.data.compliance_class),
      complianceNotes: parsed.data.compliance_notes,
    };
  } catch (err) {
    log.error({ err, title: input.title }, 'classification failed — leaving unclassified');
    return null;
  }
}
