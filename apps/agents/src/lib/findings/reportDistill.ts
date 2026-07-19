// Pure distillation helpers for founder feedback on market-report narrations.
// The marketReportFeedbackListener claims undistilled market_report_feedback
// rows, asks the editor to fold them into the standing guideline list, and
// upserts the market_report_guidelines singleton. Sibling of
// workflows/socialPost/distill.ts (per-account) — this stream has one list.

import { z } from 'zod';

export const MAX_REPORT_GUIDELINES = 15;

// The editor's revised list — the FULL replacement, not a delta.
export const distilledReportGuidelinesSchema = z.object({
  guidelines: z
    .array(z.string().min(1))
    .max(MAX_REPORT_GUIDELINES)
    .describe('The full revised guideline list — one imperative sentence per item.'),
});
export type DistilledReportGuidelines = z.infer<typeof distilledReportGuidelinesSchema>;

/** One claimed market_report_feedback row, the fields the distill prompt needs. */
export interface ReportFeedbackItem {
  verdict: string | null;
  feedback: string;
  narration_excerpt: string | null;
}

export function buildReportDistillPrompt(params: {
  currentGuidelines: string[];
  feedbackItems: ReportFeedbackItem[];
}): string {
  const { currentGuidelines, feedbackItems } = params;

  const current = currentGuidelines.length
    ? currentGuidelines.map((g) => `- ${g}`).join('\n')
    : '(none yet)';

  const notes = feedbackItems
    .map((item, i) => {
      const verdict = item.verdict ? ` [${item.verdict}]` : '';
      const excerpt = item.narration_excerpt
        ? `\n   The narration it referred to: "${item.narration_excerpt}"`
        : '';
      return `${i + 1}.${verdict} ${item.feedback}${excerpt}`;
    })
    .join('\n');

  return `You maintain a compact list of standing writing guidelines for the daily market report's lead commentary. The list is injected into every future narration, so each item must be a durable rule, not a one-off note.

These guidelines shape TONE and EMPHASIS only. The narration also runs under hard compliance rules (payload-only numbers, no advice framing, gated vocabulary) that guidelines can never loosen — never write a rule that conflicts with them.

Fold the new feedback below into the current list:
- Merge duplicates and near-duplicates into one rule.
- Generalise one-off comments into durable rules — but only where the feedback clearly implies a standing preference; drop pure one-offs that don't.
- Drop any current rule contradicted by newer feedback.
- Keep each item ONE imperative sentence.
- At most ${MAX_REPORT_GUIDELINES} items — prefer fewer, sharper rules.
- Positive feedback ("more like this") becomes a rule to keep doing that thing.

Return the FULL revised list (not just the changes).

## Current guidelines
${current}

## New feedback
${notes}`;
}
