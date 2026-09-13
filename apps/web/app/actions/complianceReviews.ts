'use server';

import { revalidatePath } from 'next/cache';
import { getAuthedClient } from '@/lib/action';
import { humanizeError } from '@/lib/errors';
import { LIVE_STATUS, type ReviewableKind } from '@/lib/compliance/queue';

/**
 * Recording a Lex review, and publishing what was reviewed.
 *
 * These are one action rather than two on purpose. Both tables carry a CHECK
 * constraint — `active_requires_lex_review` and `published_requires_lex_review`
 * — that already makes review the precondition of publication, and template
 * bodies live in migrations, so a reviewer who finds a problem does not resolve
 * it here; they change the migration. That leaves publication as the only
 * outcome this surface produces, and splitting it into two buttons would invite
 * the state the constraints exist to prevent: reviewed, and quietly never
 * published.
 *
 * `lex_reviewed_by` is the signed-in user's id directly. `is_team_member()`
 * matches `team_members.id` against `auth.uid()`, so the two are the same
 * value, and there is no lookup to get wrong.
 */

const TABLE = {
  template: 'prepare_templates',
  library: 'client_library_entries',
} as const satisfies Record<ReviewableKind, string>;

export interface RecordReviewInput {
  kind: ReviewableKind;
  id: string;
  /** What the reviewer looked at and concluded. Required — see below. */
  notes: string;
  /** ISO date. Required, and set per artefact rather than globally. */
  reviewDueDate: string;
}

export async function recordLexReview(input: RecordReviewInput) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  const notes = input.notes.trim();
  if (!notes) {
    // A review with no note is a timestamp. The whole reason the column exists
    // is so that someone reading this row in eighteen months can tell what was
    // checked, and an empty string cannot answer that.
    return { error: 'Add a note saying what you reviewed before publishing.' };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.reviewDueDate)) {
    return { error: 'Set the date this should next be reviewed.' };
  }

  const reviewedAt = new Date().toISOString();

  const shared = {
    lex_reviewed_at: reviewedAt,
    lex_reviewed_by: auth.user.id,
    lex_notes: notes,
    review_due_date: input.reviewDueDate,
  };

  // `last_reviewed_at` is only on the library table, where the constraint
  // requires it alongside the Lex columns. Templates have no such column.
  const patch =
    input.kind === 'library'
      ? { ...shared, status: LIVE_STATUS.library, last_reviewed_at: reviewedAt }
      : { ...shared, status: LIVE_STATUS.template };

  const { error } = await auth.supabase
    .from(TABLE[input.kind])
    .update(patch)
    .eq('id', input.id);

  if (error) {
    // `idx_prepare_templates_one_active` allows one active version per slug, so
    // publishing a second version fails here rather than silently splitting the
    // subscriber base. Say which it is, because the generic message is
    // unreadable and the fix — supersede the live version first — is specific.
    if (error.code === '23505') {
      return {
        error:
          'Another version of this is already live. Supersede that version before publishing this one.',
      };
    }
    return { error: humanizeError(error) };
  }

  revalidatePath('/compliance');
  return { success: true };
}
