/**
 * What is waiting for Lex review, and what is due to be looked at again.
 *
 * The two migrations that introduced these tables also introduced two views —
 * `v_prepare_template_reviews` and `v_client_library_reviews` — and neither one
 * is an approval queue. Both filter to rows that are *already live*, because
 * they were written to feed a review calendar. The queue needs the opposite
 * set: the drafts nothing has published yet. So this module works from the base
 * tables and answers both questions, and the views stay what they are.
 *
 * The rules live here, as pure functions over plain rows, because they are the
 * part that must not be wrong and they do not need a database to exercise.
 *
 * Spec: `docs/features/client-app/build-progress.md`.
 */

/** A template or library entry, reduced to the fields the queue reasons about. */
export interface ReviewableRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  lexReviewedAt: string | null;
  reviewDueDate: string | null;
}

/**
 * Statuses that mean "not yet in front of a subscriber".
 *
 * `prepare_templates` and `client_library_entries` have different status sets —
 * templates carry `under_review` and `approved`, library entries do not — so
 * the union is listed rather than the intersection. A status in neither list is
 * live, superseded or archived, and none of those want a reviewer.
 */
const AWAITING: readonly string[] = Object.freeze([
  'draft',
  'under_review',
  'lex_review',
  'approved',
]);

/** The status each kind of row takes once published. */
export const LIVE_STATUS = Object.freeze({
  template: 'active',
  library: 'published',
} as const);

export type ReviewableKind = keyof typeof LIVE_STATUS;

export function isAwaitingReview(row: ReviewableRow): boolean {
  return AWAITING.includes(row.status);
}

export function isLive(row: ReviewableRow, kind: ReviewableKind): boolean {
  return row.status === LIVE_STATUS[kind];
}

/**
 * Days until a row is due for re-review. Negative means overdue.
 *
 * `null` when no due date is set, which is a different thing from "not due yet"
 * and is rendered differently: a live row with no due date is one nobody will
 * ever revisit, and that is worth surfacing rather than hiding behind a dash.
 */
export function daysUntilReview(
  reviewDueDate: string | null,
  today: Date = new Date(),
): number | null {
  if (!reviewDueDate) return null;

  const due = Date.parse(`${reviewDueDate}T00:00:00Z`);
  if (Number.isNaN(due)) return null;

  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((due - midnight) / 86_400_000);
}

export type ReviewUrgency = 'overdue' | 'soon' | 'scheduled' | 'unscheduled';

/**
 * How loudly to say a live row needs re-reading.
 *
 * `soon` is thirty days, which is not a rule from anywhere — it is long enough
 * that a founder can act on it without dropping what they are doing, and short
 * enough that it still means something.
 */
export function reviewUrgency(days: number | null): ReviewUrgency {
  if (days === null) return 'unscheduled';
  if (days < 0) return 'overdue';
  if (days <= 30) return 'soon';
  return 'scheduled';
}

/** Awaiting review first, then live rows worth re-reading soonest. */
export function sortQueue<T extends ReviewableRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const aDue = daysUntilReview(a.reviewDueDate);
    const bDue = daysUntilReview(b.reviewDueDate);

    // Unscheduled sorts last among live rows: it needs attention, but a row
    // that is already three weeks overdue needs it first.
    if (aDue === null && bDue === null) return a.slug.localeCompare(b.slug);
    if (aDue === null) return 1;
    if (bDue === null) return -1;
    if (aDue !== bDue) return aDue - bDue;
    return a.slug.localeCompare(b.slug);
  });
}
