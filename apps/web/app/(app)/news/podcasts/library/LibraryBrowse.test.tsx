import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import { LibraryBrowse } from './LibraryBrowse';
import type { EpisodeLibraryCard } from '@platform/shared';

function card(overrides: Partial<EpisodeLibraryCard> = {}): EpisodeLibraryCard {
  return {
    id: 'ep-1',
    slug: 'ep-1',
    title: 'Custody in 2026',
    published_at: '2026-05-01T00:00:00Z',
    image_url: null,
    duration_seconds: 3600,
    youtube_url: null,
    audio_url: null,
    episode_summary: 'A discussion of board-level custody.',
    key_takeaways: [{ text: 'Multisig matters.', start_seconds: 90 }],
    chapters: [],
    category: 'corporate',
    relevance_score: 0.5,
    topic_tags: [],
    source_name: 'Sound Money',
    ...overrides,
  };
}

describe('LibraryBrowse', () => {
  it('shows the empty state when there are no approved episodes', () => {
    render(<LibraryBrowse episodes={[]} />);
    expect(screen.getByText('The library is empty')).toBeInTheDocument();
  });

  it('renders a card per episode, most-relevant first by default', () => {
    render(
      <LibraryBrowse
        episodes={[
          card({ id: 'a', slug: 'a', title: 'Low relevance', relevance_score: 0.2 }),
          card({ id: 'b', slug: 'b', title: 'High relevance', relevance_score: 0.9 }),
        ]}
      />,
    );
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(['High relevance', 'Low relevance']);
  });

  it('filters by category', () => {
    render(
      <LibraryBrowse
        episodes={[
          card({ id: 'a', slug: 'a', title: 'Macro ep', category: 'macro' }),
          card({ id: 'b', slug: 'b', title: 'Corporate ep', category: 'corporate' }),
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'macro' } });
    expect(screen.getByText('Macro ep')).toBeInTheDocument();
    expect(screen.queryByText('Corporate ep')).not.toBeInTheDocument();
  });

  it('filters to episodes with takeaways', () => {
    render(
      <LibraryBrowse
        episodes={[
          card({ id: 'a', slug: 'a', title: 'With takeaways', key_takeaways: [{ text: 'x', start_seconds: null }] }),
          card({ id: 'b', slug: 'b', title: 'No takeaways', key_takeaways: [] }),
        ]}
      />,
    );
    fireEvent.click(screen.getByLabelText('Has takeaways'));
    expect(screen.getByText('With takeaways')).toBeInTheDocument();
    expect(screen.queryByText('No takeaways')).not.toBeInTheDocument();
  });

  it('links each card to the episode page by slug', () => {
    render(<LibraryBrowse episodes={[card({ slug: 'custody-2026' })]} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/news/podcasts/custody-2026');
    expect(within(link).getByRole('heading', { level: 3 })).toHaveTextContent('Custody in 2026');
  });
});
