import {
  parseTemplate,
  validateTemplate,
  type ParsedTemplate,
  type TemplateProblem,
} from '@platform/shared';

/**
 * The rules around editing a body and cutting a new version.
 *
 * Pure, because these are the rules that decide whether a subscriber sees text
 * nobody reviewed, and they should be exercisable without a database.
 *
 * The database enforces the same immutability independently — see
 * `supabase/migrations/20260912050000_frozen_bodies.sql`. This module is not
 * the guard; it is what lets the page say *why* something is frozen before
 * someone types into a box they cannot save.
 */

/**
 * States in which a body may no longer change.
 *
 * `superseded` and `archived` are frozen for the same reason `active` is,
 * not as an afterthought: a superseded Service Statement is the exact text some
 * subscriber acknowledged last year, and it is the evidence that they did.
 */
const FROZEN_STATUSES: readonly string[] = Object.freeze([
  'active',
  'published',
  'superseded',
  'archived',
]);

export function isBodyEditable(status: string): boolean {
  return !FROZEN_STATUSES.includes(status);
}

/**
 * Why a body cannot be edited, in a sentence, or `null` when it can.
 *
 * Distinguishes live from retired because the remedy differs: a live document
 * gets a new version, a retired one gets nothing — there is no reason to edit
 * an archived statement and every reason not to.
 */
export function frozenReason(status: string): string | null {
  if (isBodyEditable(status)) return null;

  if (status === 'active' || status === 'published') {
    return 'This is live. Subscribers have acknowledged this exact text, so it cannot change — create a new version instead.';
  }

  return 'This version is retired. It is the text people were given at the time, which is what makes it evidence.';
}

/**
 * The next version string, or null when the current one cannot be bumped.
 *
 * Handles the dotted numeric versions the seeds use ("0.1" → "0.2", "1.0" →
 * "1.1"). Anything else returns null and the caller asks for a version rather
 * than inventing one — a version scheme is a decision, and guessing at
 * "2026-Q3-final" would produce something worse than a prompt.
 */
export function suggestNextVersion(current: string): string | null {
  const match = /^(\d+)\.(\d+)$/.exec(current.trim());
  if (!match) return null;

  return `${match[1]}.${Number(match[2]) + 1}`;
}

/** A version string that could sensibly identify a document. */
export function isValidVersion(version: string): boolean {
  const trimmed = version.trim();
  // The schema says TEXT and only requires uniqueness per type, so this is
  // about legibility rather than correctness: the string renders next to a
  // title and is recorded against every acknowledgement. No internal
  // whitespace is the rule that keeps "1.0", "2026-06" and "1.0-draft" while
  // rejecting "the one we sent in June".
  return trimmed.length > 0 && trimmed.length <= 40 && !/\s/.test(trimmed);
}

export interface TemplateCheck {
  ok: boolean;
  problems: TemplateProblem[];
  /**
   * The parsed body, returned so a caller does not parse twice.
   *
   * The save path needs `factsRequired` off the parse to write the column, and
   * a second `parseTemplate` call there would be a second chance for the column
   * and the body to disagree about what the body says.
   */
  parsed: ParsedTemplate;
}

/**
 * Parse and validate a template body before it is saved.
 *
 * This is the check `packages/shared/src/prepare.ts` has always said belonged
 * here — "`apps/web` validates on save before a founder can set a template
 * active". Until there was an editor there was nothing to validate on save.
 *
 * It refuses on any problem rather than warning. The validator's own failure
 * mode is a template that saves and will not render, discovered by a subscriber
 * halfway through assembling a board paper, and a warning is exactly the shape
 * of thing that gets clicked past.
 */
export function checkTemplateBody(body: string, knownFactKeys: readonly string[]): TemplateCheck {
  const parsed = parseTemplate(body);
  const problems = validateTemplate(parsed, body, knownFactKeys);

  return { ok: problems.length === 0, problems, parsed };
}

/**
 * A template body with its front-matter `version:` rewritten.
 *
 * The version lives in two places — the column and the body's front matter —
 * and `toPrepareTemplate` in the live adapter takes the column as
 * authoritative. That makes a mismatch invisible rather than harmless: the app
 * reads one and a human reading the body reads the other. Cutting a new version
 * rewrites the front matter so the two agree from the start.
 */
export function withVersion(body: string, version: string): string {
  return body.replace(/^(---\r?\n[\s\S]*?)^version:.*$/m, `$1version: ${version}`);
}
