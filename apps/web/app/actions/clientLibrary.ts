'use server';

import { revalidatePath } from 'next/cache';
import { getAuthedClient } from '@/lib/action';
import { humanizeError } from '@/lib/errors';
import { frozenReason } from '@/lib/compliance/editing';

/**
 * The Minute library: sections and entries.
 *
 * `/library` is the reference layer a subscriber reads when a term in the Brief
 * or a heading in a `/prepare` template needs explaining. It had no sections,
 * no entries and no way to make either, so the route rendered nothing — and
 * rendered nothing quietly, which is how it went unnoticed.
 *
 * Publication is not here. An entry reaches a subscriber through the same Lex
 * queue on `/compliance` as a template, because `published_requires_lex_review`
 * makes review the precondition and one publish path is better than two.
 */

export async function createLibrarySection(input: {
  key: string;
  title: string;
  clientType: 'corporate' | 'smsf' | 'both';
  sortOrder?: number;
}) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  const key = input.key.trim().toLowerCase();
  const title = input.title.trim();

  if (!/^[a-z0-9-]+$/.test(key)) {
    // The key is stable and referenced from elsewhere; a title can be reworded
    // freely and a key cannot, so it is worth being strict about here.
    return { error: 'The key can hold lowercase letters, numbers and hyphens only.' };
  }
  if (!title) return { error: 'Give the section a title.' };

  const { error } = await auth.supabase.from('client_library_sections').insert({
    key,
    title,
    client_type: input.clientType,
    sort_order: input.sortOrder ?? 0,
  });

  if (error) {
    if (error.code === '23505') return { error: `A section with the key ${key} already exists.` };
    return { error: humanizeError(error) };
  }

  revalidatePath('/compliance');
  return { success: true };
}

export async function createLibraryEntry(input: {
  sectionId: string;
  slug: string;
  title: string;
  body: string;
  regulatoryReferences?: string[];
}) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  const slug = input.slug.trim().toLowerCase();
  const title = input.title.trim();
  const body = input.body.trim();

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { error: 'The slug can hold lowercase letters, numbers and hyphens only.' };
  }
  if (!title) return { error: 'Give the entry a title.' };
  if (!body) return { error: 'An entry with no body is not an entry.' };

  const { error } = await auth.supabase.from('client_library_entries').insert({
    section_id: input.sectionId,
    slug,
    title,
    body,
    regulatory_references: input.regulatoryReferences ?? [],
    // Draft, always. `published_requires_lex_review` would reject anything
    // else, and the right response to that constraint is to respect it.
    status: 'draft',
  });

  if (error) {
    if (error.code === '23505') return { error: `An entry with the slug ${slug} already exists.` };
    return { error: humanizeError(error) };
  }

  revalidatePath('/compliance');
  return { success: true };
}

/**
 * Edit an unpublished entry's body.
 *
 * No parser and no validation, unlike a `/prepare` template — an entry is
 * markdown prose and there is nothing to parse. That is a reason the editor
 * checks less, not a reason to withhold one, which is where an earlier pass got
 * this wrong and left the library uneditable.
 *
 * The immutability rule is the same and comes from the same trigger: a
 * published body cannot change, because a subscriber read it and a version of
 * the truth they were shown should still exist.
 */
export async function updateLibraryEntryBody(id: string, body: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  if (body.trim() === '') return { error: 'An entry with no body is not an entry.' };

  const { data: row, error: readError } = await auth.supabase
    .from('client_library_entries')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();

  if (readError) return { error: humanizeError(readError) };
  if (!row) return { error: 'That entry no longer exists.' };

  const frozen = frozenReason(row.status);
  if (frozen) return { error: frozen };

  const { error } = await auth.supabase
    .from('client_library_entries')
    .update({ body })
    .eq('id', id);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/compliance');
  return { success: true };
}
