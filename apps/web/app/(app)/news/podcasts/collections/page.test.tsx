import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

let fake: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

// Stub the interactive child so this stays a unit on the page's data wiring.
vi.mock('./CollectionsIndex', () => ({
  CollectionsIndex: ({ collections }: { collections: Array<{ id: string; title: string; episode_count: number }> }) => (
    <div data-testid="collections-index" data-count={collections.length}>
      {collections.map((c) => (
        <div key={c.id}>{`${c.title}:${c.episode_count}`}</div>
      ))}
    </div>
  ),
}));

import CollectionsPage from './page';

beforeEach(() => {
  fake = createFakeSupabase();
});

describe('CollectionsPage', () => {
  it('joins episode counts onto each collection', async () => {
    fake.__setResponse('podcast_collections', {
      data: [
        { id: 'c-1', slug: 'a', title: 'Custody', intro: null, created_by: null, created_at: 'x', updated_at: 'x' },
        { id: 'c-2', slug: 'b', title: 'Accounting', intro: null, created_by: null, created_at: 'x', updated_at: 'x' },
      ],
      error: null,
    });
    fake.__setResponse('podcast_collection_items', {
      data: [{ collection_id: 'c-1' }, { collection_id: 'c-1' }, { collection_id: 'c-2' }],
      error: null,
    });

    render(await CollectionsPage());

    expect(screen.getByTestId('collections-index')).toHaveAttribute('data-count', '2');
    expect(screen.getByText('Custody:2')).toBeInTheDocument();
    expect(screen.getByText('Accounting:1')).toBeInTheDocument();
  });

  it('renders an empty index when there are no collections', async () => {
    fake.__setResponse('podcast_collections', { data: null, error: null });
    render(await CollectionsPage());
    expect(screen.getByTestId('collections-index')).toHaveAttribute('data-count', '0');
  });
});
