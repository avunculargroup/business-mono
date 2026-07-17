import { normalizeGuidelines } from './distill.js';

// Renders an account's distilled feedback guidelines (account_feedback_guidelines
// .guidelines JSONB) into the prompt block Charlie and the editor receive. Kept
// pure so it can be unit-tested without the DB — the handler loads the rows and
// passes the parsed lists in (same shape as history.ts).

/**
 * Parse the JSONB guidelines column into a clean string[]. Tolerates null,
 * non-array, and non-string entries — bad data degrades to "no guidelines",
 * never a failed run.
 */
export function toGuidelines(rowJson: unknown): string[] {
  return normalizeGuidelines(rowJson);
}

/** The standing-feedback instruction block. Empty when there are no guidelines. */
export function buildGuidelinesBlock(guidelines: string[]): string {
  if (guidelines.length === 0) return '';
  const list = guidelines.map((g) => `- ${g}`).join('\n');
  return `## Standing feedback from the founder
These guidelines come from the founder's own review feedback on past drafts. Follow every one of them:
${list}`;
}
