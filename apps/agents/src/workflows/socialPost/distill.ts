import { z } from 'zod';

// Pure distillation helpers for founder feedback on social drafts. The
// feedbackDistillListener claims undistilled content_feedback rows for an
// account, asks the editor to fold them into the account's standing guideline
// list, and upserts the result to account_feedback_guidelines. Kept pure so the
// prompt and normalisation can be unit-tested without an agent or the DB.

export const MAX_GUIDELINES = 15;

// The editor's revised list — the FULL replacement, not a delta.
export const distilledGuidelinesSchema = z.object({
  guidelines: z
    .array(z.string().min(1))
    .max(MAX_GUIDELINES)
    .describe('The full revised guideline list — one imperative sentence per item.'),
});
export type DistilledGuidelines = z.infer<typeof distilledGuidelinesSchema>;

/** One claimed content_feedback row, the fields the distill prompt needs. */
export interface FeedbackItem {
  verdict: string | null;
  feedback: string;
  post_form: string | null;
  draft_excerpt: string | null;
}

/**
 * Build the editor's distillation prompt: current guidelines + the new feedback
 * notes, asking for the full revised list back.
 */
export function buildDistillPrompt(params: {
  accountLabel: string;
  platform: string;
  currentGuidelines: string[];
  feedbackItems: FeedbackItem[];
}): string {
  const { accountLabel, platform, currentGuidelines, feedbackItems } = params;

  const current = currentGuidelines.length
    ? currentGuidelines.map((g) => `- ${g}`).join('\n')
    : '(none yet)';

  const notes = feedbackItems
    .map((item, i) => {
      const verdict = item.verdict ? ` [${item.verdict}]` : '';
      const form = item.post_form ? ` (form: ${item.post_form})` : '';
      const excerpt = item.draft_excerpt ? `\n   The draft it referred to: "${item.draft_excerpt}"` : '';
      return `${i + 1}.${verdict}${form} ${item.feedback}${excerpt}`;
    })
    .join('\n');

  return `You maintain a compact list of standing writing guidelines for ${accountLabel}'s ${platform} posts. The list is injected into every future draft, so each item must be a durable rule, not a one-off note.

Fold the new feedback below into the current list:
- Merge duplicates and near-duplicates into one rule.
- Generalise one-off comments into durable rules — but only where the feedback clearly implies a standing preference; drop pure one-offs that don't.
- Drop any current rule contradicted by newer feedback.
- Keep each item ONE imperative sentence.
- At most ${MAX_GUIDELINES} items — prefer fewer, sharper rules.
- Positive feedback ("more like this") becomes a rule to keep doing that thing.

Return the FULL revised list (not just the changes).

## Current guidelines
${current}

## New feedback
${notes}`;
}

/**
 * Defensive normalisation of a guideline list (from the LLM or the DB): trim,
 * drop empties, dedupe case-insensitively, cap. Never throws.
 */
export function normalizeGuidelines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.replace(/\s+/g, ' ').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= MAX_GUIDELINES) break;
  }
  return out;
}
