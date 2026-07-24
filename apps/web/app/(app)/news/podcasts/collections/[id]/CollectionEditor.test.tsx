import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PodcastCollection, PodcastCollectionEpisode } from '@platform/shared';

// jsdom doesn't implement the <dialog> methods the Modal/ConfirmDialog effects
// call on mount; stub them so rendering (with the dialogs closed) doesn't throw.
beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
  }
});

// Hoisted so the vi.mock factories (which run before top-level consts) can read
// these without a temporal-dead-zone error.
const { refresh, push, toast, actions } = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  actions: {
    removeCollectionItem: vi.fn(),
    moveCollectionItem: vi.fn(),
    addEpisodeToCollection: vi.fn(),
    updateCollection: vi.fn(),
    deleteCollection: vi.fn(),
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => toast }));
vi.mock('@/app/actions/podcastCollections', () => actions);

import { CollectionEditor } from './CollectionEditor';

const collection: PodcastCollection = {
  id: 'c-1',
  slug: 'custody',
  title: 'The state of custody',
  intro: 'Why these episodes.',
  created_by: null,
  created_at: 'x',
  updated_at: 'x',
};

function ep(overrides: Partial<PodcastCollectionEpisode>): PodcastCollectionEpisode {
  return {
    item_id: 'i-1',
    position: 0,
    episode_id: 'ep-1',
    slug: 'ep-1',
    title: 'Episode one',
    source_name: 'Sound Money',
    image_url: null,
    duration_seconds: 3600,
    published_at: '2026-05-01T00:00:00Z',
    relevance_score: 0.5,
    category: 'corporate',
    episode_summary: 'A summary.',
    ...overrides,
  };
}

const episodes = [
  ep({ item_id: 'i-1', title: 'First', position: 0 }),
  ep({ item_id: 'i-2', title: 'Second', position: 1 }),
  ep({ item_id: 'i-3', title: 'Third', position: 2 }),
];

beforeEach(() => {
  refresh.mockClear();
  push.mockClear();
  toast.success.mockClear();
  toast.error.mockClear();
  // Default every action to success; individual cases can override.
  Object.values(actions).forEach((fn) => {
    fn.mockReset();
    fn.mockResolvedValue({ success: true });
  });
});

describe('CollectionEditor', () => {
  it('renders the intro and members in the given order', () => {
    render(<CollectionEditor collection={collection} episodes={episodes} pickerEpisodes={[]} />);
    expect(screen.getByText('Why these episodes.', { selector: 'p' })).toBeInTheDocument();
    const titles = screen.getAllByRole('link', { name: /First|Second|Third/ }).map((n) => n.textContent);
    expect(titles).toEqual(['First', 'Second', 'Third']);
    expect(screen.getByText('3 episodes')).toBeInTheDocument();
  });

  it('disables move-up on the first member and move-down on the last', () => {
    render(<CollectionEditor collection={collection} episodes={episodes} pickerEpisodes={[]} />);
    const ups = screen.getAllByLabelText('Move up');
    const downs = screen.getAllByLabelText('Move down');
    expect(ups[0]).toBeDisabled();
    expect(ups[2]).not.toBeDisabled();
    expect(downs[0]).not.toBeDisabled();
    expect(downs[2]).toBeDisabled();
  });

  it('moves a member down and refreshes on success', async () => {
    render(<CollectionEditor collection={collection} episodes={episodes} pickerEpisodes={[]} />);
    fireEvent.click(screen.getAllByLabelText('Move down')[0]);
    await waitFor(() => expect(actions.moveCollectionItem).toHaveBeenCalledWith('c-1', 'i-1', 'down'));
    expect(refresh).toHaveBeenCalled();
  });

  it('removes a member and surfaces the toast', async () => {
    render(<CollectionEditor collection={collection} episodes={episodes} pickerEpisodes={[]} />);
    fireEvent.click(screen.getByLabelText('Remove Second'));
    await waitFor(() => expect(actions.removeCollectionItem).toHaveBeenCalledWith('i-2'));
    expect(toast.success).toHaveBeenCalledWith('Episode removed');
  });

  it('shows the empty state when the pack has no episodes', () => {
    render(<CollectionEditor collection={collection} episodes={[]} pickerEpisodes={[]} />);
    expect(screen.getByText('No episodes yet')).toBeInTheDocument();
  });
});
