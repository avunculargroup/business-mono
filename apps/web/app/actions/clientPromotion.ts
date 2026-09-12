'use server';

import { revalidatePath } from 'next/cache';
import { getAuthedClient } from '@/lib/action';
import { humanizeError } from '@/lib/errors';

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
 * Clear a register entry for subscribers.
 *
 * Distinct from `is_published`, which is whether the internal register shows
 * it. Those are different questions with different answers, and collapsing them
 * would make the second unaskable.
 */
export async function setRegisterClearance(companyId: string, cleared: boolean) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  const { error } = await auth.supabase
    .from('research_companies')
    .update(
      cleared
        ? {
            client_cleared: true,
            client_cleared_by: auth.user.id,
            client_cleared_at: new Date().toISOString(),
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
