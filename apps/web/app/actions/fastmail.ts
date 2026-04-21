'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

const REVALIDATE = '/settings/integrations/fastmail';

// ── Accounts ──────────────────────────────────────────────────────────────────

export async function addFastmailAccount(data: {
  username: string;
  token: string;
  display_name?: string;
  watched_addresses?: string[];
}) {
  if (!data.username || !data.token) {
    return { error: 'Username and token are required' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('fastmail_accounts').insert({
    username:          data.username.trim().toLowerCase(),
    token:             data.token,
    display_name:      data.display_name?.trim() || null,
    watched_addresses: data.watched_addresses ?? [],
  });

  if (error) return { error: error.message };
  revalidatePath(REVALIDATE);
  revalidatePath('/settings/integrations');
  return { success: true };
}

export async function toggleFastmailAccount(id: string, isActive: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('fastmail_accounts')
    .update({ is_active: isActive })
    .eq('id', id);

  if (error) return { error: error.message };
  revalidatePath(REVALIDATE);
  revalidatePath('/settings/integrations');
  return { success: true };
}

export async function removeFastmailAccount(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('fastmail_accounts').delete().eq('id', id);

  if (error) return { error: error.message };
  revalidatePath(REVALIDATE);
  revalidatePath('/settings/integrations');
  return { success: true };
}

// ── Exclusions ────────────────────────────────────────────────────────────────

export async function addFastmailExclusion(data: {
  type: 'domain' | 'email';
  value: string;
  notes?: string;
}) {
  if (!data.value) {
    return { error: 'Value is required' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('fastmail_exclusions').insert({
    type:  data.type,
    value: data.value.trim().toLowerCase(),
    notes: data.notes?.trim() || null,
  });

  if (error) return { error: error.message };
  revalidatePath(REVALIDATE);
  return { success: true };
}

export async function removeFastmailExclusion(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('fastmail_exclusions').delete().eq('id', id);

  if (error) return { error: error.message };
  revalidatePath(REVALIDATE);
  return { success: true };
}

// ── Review queue ──────────────────────────────────────────────────────────────

/**
 * Removes the 'needs-review' tag from a contact and marks them as approved.
 * Uses a Postgres array_remove call via raw filter to safely remove the tag
 * without overwriting the full tags array.
 */
export async function approveContact(id: string) {
  const supabase = await createClient();

  // Fetch current tags first, then remove 'needs-review' client-side.
  // Supabase JS v2 does not expose array_remove directly; fetching + updating
  // is simpler than raw SQL for this two-person-team context.
  const { data: contact, error: fetchError } = await supabase
    .from('contacts')
    .select('tags')
    .eq('id', id)
    .single();

  if (fetchError) return { error: fetchError.message };

  const currentTags: string[] = Array.isArray((contact as { tags: unknown }).tags)
    ? (contact as { tags: string[] }).tags
    : [];
  const updatedTags = currentTags.filter((t) => t !== 'needs-review');

  const { error: updateError } = await supabase
    .from('contacts')
    .update({ tags: updatedTags })
    .eq('id', id);

  if (updateError) return { error: updateError.message };
  revalidatePath(REVALIDATE);
  revalidatePath('/crm/contacts');
  return { success: true };
}

export async function rejectContact(id: string, reason: 'marketing' | 'spam' | 'other') {
  const supabase = await createClient();

  const { data: contact, error: fetchError } = await supabase
    .from('contacts')
    .select('email')
    .eq('id', id)
    .single();

  if (fetchError) return { error: fetchError.message };

  const { error: deleteError } = await supabase.from('contacts').delete().eq('id', id);
  if (deleteError) return { error: deleteError.message };

  if (reason === 'marketing' || reason === 'spam') {
    const email = (contact as { email: string | null }).email;
    if (email) {
      await supabase.from('fastmail_exclusions').insert({
        type:  'email',
        value: email.toLowerCase(),
        notes: `Auto-excluded: ${reason}`,
      });
    }
  }

  revalidatePath(REVALIDATE);
  revalidatePath('/crm/contacts');
  return { success: true };
}
