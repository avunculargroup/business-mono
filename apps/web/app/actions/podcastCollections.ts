'use server';

import { getAuthedClient } from '@/lib/action';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { humanizeError } from '@/lib/errors';

const INDEX_PATH = '/news/podcasts/collections';

// podcast_collections / podcast_collection_items are post-migration, so they
// aren't in the generated Database types yet. Access goes through a boundary
// cast — the same pattern the rest of the podcast intelligence code uses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from: (t: string) => any };

const collectionSchema = z.object({
  title: z.string().trim().min(1, 'Give the collection a title'),
  intro: z.string().trim().optional(),
});

// Create a briefing pack. Title required, intro optional. The slug is filled by
// the DB trigger, so we read it back for the redirect target.
export async function createCollection(formData: FormData) {
  const parsed = collectionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const db = auth.supabase as unknown as LooseClient;

  const { data, error } = await db
    .from('podcast_collections')
    .insert({
      title: parsed.data.title,
      intro: parsed.data.intro || null,
      created_by: auth.user.id,
    })
    .select('id, slug')
    .single();

  if (error) return { error: humanizeError(error) };
  revalidatePath(INDEX_PATH);
  return { success: true, id: (data as { id: string }).id, slug: (data as { slug: string }).slug };
}

// Edit a pack's title and/or intro.
export async function updateCollection(id: string, input: { title: string; intro: string }) {
  const parsed = collectionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const db = auth.supabase as unknown as LooseClient;

  const { error } = await db
    .from('podcast_collections')
    .update({ title: parsed.data.title, intro: parsed.data.intro || null })
    .eq('id', id);

  if (error) return { error: humanizeError(error) };
  revalidatePath(INDEX_PATH);
  return { success: true };
}

// Delete a pack. Items cascade at the DB level.
export async function deleteCollection(id: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const db = auth.supabase as unknown as LooseClient;

  const { error } = await db.from('podcast_collections').delete().eq('id', id);

  if (error) return { error: humanizeError(error) };
  revalidatePath(INDEX_PATH);
  return { success: true };
}

// Append an episode to a pack. Position is max(existing) + 1 so the newest
// addition lands at the end of the curated order. A duplicate add trips the
// UNIQUE(collection, episode) constraint; humanizeError turns that 23505 into a
// "already exists" message rather than a raw error.
export async function addEpisodeToCollection(collectionId: string, episodeId: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const db = auth.supabase as unknown as LooseClient;

  const { data: last, error: readErr } = await db
    .from('podcast_collection_items')
    .select('position')
    .eq('collection_id', collectionId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readErr) return { error: humanizeError(readErr) };

  const nextPosition = ((last as { position: number } | null)?.position ?? -1) + 1;

  const { error } = await db
    .from('podcast_collection_items')
    .insert({ collection_id: collectionId, episode_id: episodeId, position: nextPosition });

  if (error) return { error: humanizeError(error) };
  revalidatePath(INDEX_PATH);
  return { success: true };
}

// Remove one episode from a pack (by item id).
export async function removeCollectionItem(itemId: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const db = auth.supabase as unknown as LooseClient;

  const { error } = await db.from('podcast_collection_items').delete().eq('id', itemId);

  if (error) return { error: humanizeError(error) };
  revalidatePath(INDEX_PATH);
  return { success: true };
}

// Move an item one slot up or down within its pack by swapping `position` with
// its neighbour. A no-op (already at the edge) succeeds silently so the UI can
// treat the boundary as "nothing to do".
export async function moveCollectionItem(collectionId: string, itemId: string, direction: 'up' | 'down') {
  if (direction !== 'up' && direction !== 'down') return { error: 'Unknown direction.' };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const db = auth.supabase as unknown as LooseClient;

  const { data: rows, error: readErr } = await db
    .from('podcast_collection_items')
    .select('id, position')
    .eq('collection_id', collectionId)
    .order('position', { ascending: true });
  if (readErr) return { error: humanizeError(readErr) };

  const items = (rows ?? []) as { id: string; position: number }[];
  const index = items.findIndex((r) => r.id === itemId);
  if (index === -1) return { error: 'That episode is not in this collection.' };

  const neighbourIndex = direction === 'up' ? index - 1 : index + 1;
  if (neighbourIndex < 0 || neighbourIndex >= items.length) return { success: true };

  const item = items[index];
  const neighbour = items[neighbourIndex];

  const [a, b] = await Promise.all([
    db.from('podcast_collection_items').update({ position: neighbour.position }).eq('id', item.id),
    db.from('podcast_collection_items').update({ position: item.position }).eq('id', neighbour.id),
  ]);
  const swapError = a.error || b.error;
  if (swapError) return { error: humanizeError(swapError) };

  revalidatePath(INDEX_PATH);
  return { success: true };
}
