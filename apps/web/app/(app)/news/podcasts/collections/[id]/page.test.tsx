import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

const { notFound } = vi.hoisted(() => ({ notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }) }));
vi.mock('next/navigation', () => ({ notFound }));

let fake: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('./CollectionEditor', () => ({
  CollectionEditor: ({
    episodes,
    pickerEpisodes,
  }: {
    episodes: Array<{ item_id: string; title: string }>;
    pickerEpisodes: Array<{ id: string }>;
  }) => (
    <div
      data-testid="collection-editor"
      data-members={episodes.map((e) => e.title).join(',')}
      data-picker={pickerEpisodes.length}
    />
  ),
}));

import CollectionDetailPage from './page';

const libraryRows = [
  { id: 'ep-1', slug: 'ep-1', title: 'Custody', source_name: 'A', image_url: null, duration_seconds: null, published_at: null, relevance_score: null, category: null, episode_summary: null },
  { id: 'ep-2', slug: 'ep-2', title: 'Accounting', source_name: 'B', image_url: null, duration_seconds: null, published_at: null, relevance_score: null, category: null, episode_summary: null },
  { id: 'ep-3', slug: 'ep-3', title: 'Macro', source_name: 'C', image_url: null, duration_seconds: null, published_at: null, relevance_score: null, category: null, episode_summary: null },
];

beforeEach(() => {
  fake = createFakeSupabase();
});

describe('CollectionDetailPage', () => {
  it('renders members in curated order and offers non-members in the picker', async () => {
    fake.__setResponse('podcast_collections', {
      data: { id: 'c-1', slug: 'custody', title: 'Custody', intro: null, created_by: null, created_at: 'x', updated_at: 'x' },
      error: null,
    });
    fake.__setResponse('podcast_collection_items', {
      // Deliberately out of position order to prove the query order is honoured
      // (the page orders by position; the fake returns them as given).
      data: [
        { id: 'i-2', episode_id: 'ep-2', position: 1 },
        { id: 'i-1', episode_id: 'ep-1', position: 0 },
      ],
      error: null,
    });
    fake.__setResponse('v_episode_library', { data: libraryRows, error: null });

    render(await CollectionDetailPage({ params: Promise.resolve({ id: 'custody' }) }));

    const editor = screen.getByTestId('collection-editor');
    // Members reflect the (fake-returned) row order joined to the library.
    expect(editor).toHaveAttribute('data-members', 'Accounting,Custody');
    // ep-3 is the only library episode not in the pack.
    expect(editor).toHaveAttribute('data-picker', '1');
    // The boundary is the view — the base table is never read for member data.
    expect(fake.from).toHaveBeenCalledWith('v_episode_library');
    expect(fake.from).not.toHaveBeenCalledWith('podcast_episodes');
  });

  it('drops a member whose episode is no longer approved (fell out of the library)', async () => {
    fake.__setResponse('podcast_collections', {
      data: { id: 'c-1', slug: 'custody', title: 'Custody', intro: null, created_by: null, created_at: 'x', updated_at: 'x' },
      error: null,
    });
    fake.__setResponse('podcast_collection_items', {
      data: [
        { id: 'i-1', episode_id: 'ep-1', position: 0 },
        { id: 'i-9', episode_id: 'ep-unapproved', position: 1 },
      ],
      error: null,
    });
    fake.__setResponse('v_episode_library', { data: libraryRows, error: null });

    render(await CollectionDetailPage({ params: Promise.resolve({ id: 'custody' }) }));

    // ep-unapproved isn't in the library view, so it doesn't render — the
    // publish-wall holds inside a pack.
    expect(screen.getByTestId('collection-editor')).toHaveAttribute('data-members', 'Custody');
  });

  it('is a 404 when the collection does not exist', async () => {
    fake.__setResponse('podcast_collections', { data: null, error: null });
    await expect(CollectionDetailPage({ params: Promise.resolve({ id: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });
});
