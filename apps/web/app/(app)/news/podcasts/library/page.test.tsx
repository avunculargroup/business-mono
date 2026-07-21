import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

let fake: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

// Stub the interactive child so this stays a unit on the page's data wiring.
vi.mock('./LibraryBrowse', () => ({
  LibraryBrowse: ({ episodes }: { episodes: Array<{ id: string; title: string }> }) => (
    <div data-testid="library-browse" data-count={episodes.length}>
      {episodes.map((e) => (
        <div key={e.id}>{e.title}</div>
      ))}
    </div>
  ),
}));

import LibraryPage from './page';

beforeEach(() => {
  fake = createFakeSupabase();
});

describe('LibraryPage', () => {
  it('reads the client-safe view (not podcast_episodes) and hands episodes to the browser', async () => {
    fake.__setResponse('v_episode_library', {
      data: [
        { id: '1', slug: '1', title: 'Approved one', key_takeaways: [], chapters: [] },
        { id: '2', slug: '2', title: 'Approved two', key_takeaways: [], chapters: [] },
      ],
      error: null,
    });

    render(await LibraryPage());

    expect(fake.from).toHaveBeenCalledWith('v_episode_library');
    // The page must not touch the base table — the boundary is the view.
    expect(fake.from).not.toHaveBeenCalledWith('podcast_episodes');
    expect(screen.getByTestId('library-browse')).toHaveAttribute('data-count', '2');
    expect(screen.getByText('Approved one')).toBeInTheDocument();
  });

  it('falls back to an empty list when the view returns nothing', async () => {
    fake.__setResponse('v_episode_library', { data: null, error: null });

    render(await LibraryPage());

    expect(screen.getByTestId('library-browse')).toHaveAttribute('data-count', '0');
  });
});
