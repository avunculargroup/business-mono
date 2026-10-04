'use server';

import { revalidatePath } from 'next/cache';
import { getAuthedClient } from '@/lib/action';
import { humanizeError } from '@/lib/errors';
import { ReviewState } from '@platform/shared';

/**
 * The three gates between internal knowledge and a paying subscriber.
 *
 * Every client-facing surface in Minute except the Brief is gated on a column
 * a human has to set, and until this file existed none of them had any way to
 * set it. The gates were built, the RLS policies read them, and the product
 * would have shipped with `/signals`, `/register` and `/directory` permanently
 * empty — not broken, which is worse, because an empty page with no error looks
 * like a quiet day.
 *
 * They share a shape, and it is not accidental. Each is a boolean plus a named
 * person plus a timestamp, enforced by a CHECK constraint, because "this may be
 * shown to someone paying for it" is an act of authorship rather than a filter
 * — and an act of authorship has an author.
 *
 * Signal promotion is NOT here. It already existed as `flagClientRelevant`, and
 * a second path to the same state would be worse than none; what was missing
 * there was the approver, now set in the adapter from the bound principal.
 */

/**
 * Author the client-safe note on an ecosystem change.
 *
 * Separate from promotion, and separate from `setCuratorNote`, which is the
 * internal one. The internal note is written for a director and is allowed to
 * editorialise — "we would move off this custodian" promotes fine there and
 * must never reach a subscriber — so this is a second column with a second
 * author, never a filtered copy of the first. Promotion is an act of
 * authorship, not a filter.
 *
 * Promotion itself stays where it already was: `flagClientRelevant`, which now
 * records the approver the constraint requires.
 */
export async function setClientNote(changeId: string, note: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  const trimmed = note.trim();

  const { error } = await auth.supabase
    .from('ecosystem_changes')
    .update({ client_note: trimmed === '' ? null : trimmed })
    .eq('id', changeId);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/signals');
  return { success: true };
}

/**
 * Move a register record between draft, internal and retired.
 *
 * `draft` is where an agent-created record lands; `internal` means a human has
 * read it, which is what puts it on the internal register. Only an `internal`
 * record can be cleared for subscribers (`client_clearance_needs_review`), so
 * leaving `internal` withholds it in the same write: the safe direction, and
 * the alternative is a constraint error the person cannot act on.
 */
export async function setReviewState(companyId: string, state: ReviewState) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  const { error } = await auth.supabase
    .from('research_companies')
    .update({
      review_state: state,
      reviewed_by: auth.user.id,
      reviewed_at: new Date().toISOString(),
      ...(state === ReviewState.INTERNAL ? {} : { client_cleared: false }),
    })
    .eq('id', companyId);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/research');
  return { success: true };
}

/**
 * Approve one group of draft rows on a record.
 *
 * Rows are grouped by the ingest run that wrote them, so a reviewer approves
 * exactly what one run produced and nothing else. `runId: null` is the group
 * written by hand: events and findings with no run, and every draft fact (the
 * ingest writes no facts). Row-level, and separate from the record's own state:
 * a draft row reaches no subscriber whatever the record's state.
 *
 * Approving a run also marks its `agent_activity` row approved, so the audit
 * trail says who read it and when.
 */
export async function approveDraftRows(companyId: string, runId: string | null) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  const reviewedAt = new Date().toISOString();
  const reviewed = {
    review_state: ReviewState.INTERNAL,
    reviewed_by: auth.user.id,
    reviewed_at: reviewedAt,
  };

  for (const table of ['treasury_events', 'research_findings'] as const) {
    let query = auth.supabase
      .from(table)
      .update(reviewed)
      .eq('company_id', companyId)
      .eq('review_state', ReviewState.DRAFT);
    query = runId === null ? query.is('ingest_run_id', null) : query.eq('ingest_run_id', runId);

    const { error } = await query;
    if (error) return { error: humanizeError(error) };
  }

  if (runId === null) {
    const { error } = await auth.supabase
      .from('research_company_facts')
      .update(reviewed)
      .eq('company_id', companyId)
      .eq('review_state', ReviewState.DRAFT);
    if (error) return { error: humanizeError(error) };
  } else {
    const { error } = await auth.supabase
      .from('agent_activity')
      .update({ status: 'approved', approved_by: auth.user.id, approved_at: reviewedAt })
      .eq('workflow_run_id', runId)
      .eq('action', 'research_ingest');
    if (error) return { error: humanizeError(error) };
  }

  revalidatePath('/research');
  return { success: true };
}

/**
 * Clear a register entry for subscribers, with the summary they read.
 *
 * Distinct from `review_state`, which is whether a human has read it. The
 * summary is required here with a better message than the constraint would
 * give, and it is written for a subscriber, never copied from `curator_notes`.
 * Withholding leaves the summary in place, so clearing again starts from it.
 */
export async function setRegisterClearance(companyId: string, cleared: boolean, summary = '') {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  const trimmed = summary.trim();
  if (cleared && !trimmed) {
    return { error: 'Write the summary subscribers will read before clearing the entry.' };
  }

  const { error } = await auth.supabase
    .from('research_companies')
    .update(
      cleared
        ? {
            client_cleared: true,
            client_cleared_by: auth.user.id,
            client_cleared_at: new Date().toISOString(),
            client_summary: trimmed,
          }
        : { client_cleared: false },
    )
    .eq('id', companyId);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/research');
  return { success: true };
}

/**
 * Classify a directory entry as a financial product, or not.
 *
 * `true` means the card emits no anchor at all — no outbound link, no contact
 * action, nothing. The absence of a call to action is the structural difference
 * between reporting on a provider and distributing one, so this is the single
 * highest-consequence toggle in the internal app.
 *
 * The note is required by `classification_has_reasoning`, and required here
 * with a better message than the constraint would give. The reasoning is what
 * lets someone re-read the decision in a year and tell what it rested on.
 */
export async function classifyProduct(input: {
  productId: string;
  isFinancialProduct: boolean;
  note: string;
}) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  const note = input.note.trim();
  if (!note) {
    return { error: 'Say what the classification rests on — the constraint requires reasoning.' };
  }

  const { error } = await auth.supabase
    .from('products_services')
    .update({
      is_financial_product: input.isFinancialProduct,
      product_classification_note: note,
      classified_by: auth.user.id,
      classified_at: new Date().toISOString(),
    })
    .eq('id', input.productId);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/products');
  return { success: true };
}
