import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

let client: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => client),
}));

import {
  createCollection,
  updateCollection,
  deleteCollection,
  addEpisodeToCollection,
  removeCollectionItem,
  moveCollectionItem,
} from './podcastCollections';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function insertCall(table: string): Record<string, unknown> | undefined {
  const b = client.__buildersFor(table).find((x) => x.insert.mock.calls.length > 0);
  return b?.insert.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
}

function updateCalls(table: string): Record<string, unknown>[] {
  return client
    .__buildersFor(table)
    .filter((b) => b.update.mock.calls.length > 0)
    .map((b) => b.update.mock.calls[0]?.[0] as Record<string, unknown>);
}

beforeEach(() => {
  client = createFakeSupabase();
  revalidatePath.mockClear();
});

describe('createCollection', () => {
  it('inserts the pack with the creator and returns the slug for redirect', async () => {
    client.__setResponse('podcast_collections', { data: { id: 'c-1', slug: 'custody' }, error: null });
    client.__setUser({ id: 'user-7' });

    const result = await createCollection(formData({ title: 'Custody', intro: 'Why custody.' }));

    expect(result).toEqual({ success: true, id: 'c-1', slug: 'custody' });
    expect(insertCall('podcast_collections')).toEqual({
      title: 'Custody',
      intro: 'Why custody.',
      created_by: 'user-7',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/news/podcasts/collections');
  });

  it('nulls an empty intro', async () => {
    client.__setResponse('podcast_collections', { data: { id: 'c-1', slug: 'x' }, error: null });
    await createCollection(formData({ title: 'X', intro: '' }));
    expect(insertCall('podcast_collections')?.intro).toBeNull();
  });

  it('rejects a blank title without inserting', async () => {
    const result = await createCollection(formData({ title: '  ' }));
    expect(result.error).toBeTruthy();
    expect(client.__buildersFor('podcast_collections')).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('updateCollection', () => {
  it('updates title and intro', async () => {
    client.__setResponse('podcast_collections', { data: null, error: null });
    const result = await updateCollection('c-1', { title: 'New', intro: 'Note' });
    expect(result).toEqual({ success: true });
    expect(updateCalls('podcast_collections')[0]).toEqual({ title: 'New', intro: 'Note' });
  });
});

describe('deleteCollection', () => {
  it('deletes and revalidates', async () => {
    client.__setResponse('podcast_collections', { data: null, error: null });
    const result = await deleteCollection('c-1');
    expect(result).toEqual({ success: true });
    expect(revalidatePath).toHaveBeenCalledWith('/news/podcasts/collections');
  });
});

describe('addEpisodeToCollection', () => {
  it('appends at max(position) + 1', async () => {
    // The read (maybeSingle) and the insert share the table response; the read
    // reports the current last position, the insert reports no error.
    client.__setResponse('podcast_collection_items', { data: { position: 4 }, error: null });

    const result = await addEpisodeToCollection('c-1', 'ep-9');

    expect(result).toEqual({ success: true });
    expect(insertCall('podcast_collection_items')).toEqual({
      collection_id: 'c-1',
      episode_id: 'ep-9',
      position: 5,
    });
  });

  it('starts an empty pack at position 0', async () => {
    client.__setResponse('podcast_collection_items', { data: null, error: null });
    await addEpisodeToCollection('c-1', 'ep-1');
    expect(insertCall('podcast_collection_items')?.position).toBe(0);
  });

  it('surfaces a humane message on a duplicate membership (23505)', async () => {
    client.__setResponse('podcast_collection_items', {
      data: null,
      error: { message: 'dup', code: '23505' } as { message: string },
    });
    const result = await addEpisodeToCollection('c-1', 'ep-1');
    // humanizeError maps the unique-violation code to an "already exists" line.
    expect(result.error).toMatch(/already exists/i);
  });
});

describe('removeCollectionItem', () => {
  it('deletes the item row', async () => {
    client.__setResponse('podcast_collection_items', { data: null, error: null });
    const result = await removeCollectionItem('item-3');
    expect(result).toEqual({ success: true });
  });
});

describe('moveCollectionItem', () => {
  it('swaps positions with the previous neighbour when moving up', async () => {
    client.__setResponse('podcast_collection_items', {
      data: [
        { id: 'a', position: 0 },
        { id: 'b', position: 1 },
        { id: 'c', position: 2 },
      ],
      error: null,
    });

    const result = await moveCollectionItem('c-1', 'b', 'up');

    expect(result).toEqual({ success: true });
    // b takes a's slot (0); a takes b's slot (1).
    const updates = updateCalls('podcast_collection_items');
    expect(updates).toContainEqual({ position: 0 });
    expect(updates).toContainEqual({ position: 1 });
    expect(updates).toHaveLength(2);
  });

  it('is a no-op at the top edge', async () => {
    client.__setResponse('podcast_collection_items', {
      data: [
        { id: 'a', position: 0 },
        { id: 'b', position: 1 },
      ],
      error: null,
    });
    const result = await moveCollectionItem('c-1', 'a', 'up');
    expect(result).toEqual({ success: true });
    expect(updateCalls('podcast_collection_items')).toHaveLength(0);
  });
});

describe('auth guard', () => {
  it('refuses when signed out', async () => {
    client.__setUser(null);
    const result = await createCollection(formData({ title: 'X' }));
    expect(result.error).toBeTruthy();
    expect(client.__buildersFor('podcast_collections')).toHaveLength(0);
  });
});
