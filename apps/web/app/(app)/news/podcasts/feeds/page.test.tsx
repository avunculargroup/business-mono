import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

// `createClient` is async in the server module; hand it our fake. The `fake`
// binding is reassigned per-test in beforeEach and only dereferenced when the
// page calls createClient(), so the hoisted factory closing over it is safe.
let fake: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

// Imported after the mock above is registered (vi.mock is hoisted).
import PodcastFeedsPage from './page';

beforeEach(() => {
  fake = createFakeSupabase();
});

const sources = [
  { id: 's1', name: 'The Show', source_type: 'podcast', transcribe_with_deepgram: true, last_scanned_at: '2026-07-15T00:00:00Z', image_url: null },
  { id: 's2', name: 'The Channel', source_type: 'youtube', transcribe_with_deepgram: false, last_scanned_at: null, image_url: null },
];

const episodes = [
  { source_id: 's1', transcript_status: 'available', image_url: 'https://art.example/old.jpg', published_at: '2026-01-01T00:00:00Z' },
  { source_id: 's1', transcript_status: 'available', image_url: 'https://art.example/new.jpg', published_at: '2026-07-01T00:00:00Z' },
  { source_id: 's1', transcript_status: 'available', image_url: null, published_at: '2026-07-10T00:00:00Z' },
  { source_id: 's1', transcript_status: 'failed', image_url: null, published_at: null },
  { source_id: null, transcript_status: 'available', image_url: 'https://art.example/orphan.jpg', published_at: '2026-07-12T00:00:00Z' },
];

describe('PodcastFeedsPage', () => {
  it('renders one card per source with episode count, coverage, and Deepgram state', async () => {
    fake.__setResponse('news_sources', { data: sources, error: null });
    fake.__setResponse('podcast_episodes', { data: episodes, error: null });

    render(await PodcastFeedsPage());

    expect(screen.getByRole('heading', { name: 'Podcasts' })).toBeInTheDocument();
    expect(screen.getByText('The Show')).toBeInTheDocument();
    expect(screen.getByText('The Channel')).toBeInTheDocument();
    // The Show: 4 episodes, 3 available → 75% transcribed, Deepgram on.
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('Deepgram on')).toBeInTheDocument();
    // The Channel: no episodes, never scanned; youtube sources get no Deepgram pill.
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText(/Last run never/)).toBeInTheDocument();
    expect(screen.queryByText('Deepgram off')).not.toBeInTheDocument();
  });

  it('falls back to the most recently published episode image when the source has no stored art', async () => {
    fake.__setResponse('news_sources', { data: sources, error: null });
    fake.__setResponse('podcast_episodes', { data: episodes, error: null });

    const { container } = render(await PodcastFeedsPage());

    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('src', 'https://art.example/new.jpg');
  });

  it('prefers the source-level image_url (channel art) over episode images', async () => {
    fake.__setResponse('news_sources', {
      data: [{ ...sources[0], image_url: 'https://art.example/show.jpg' }],
      error: null,
    });
    fake.__setResponse('podcast_episodes', { data: episodes, error: null });

    const { container } = render(await PodcastFeedsPage());

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://art.example/show.jpg');
  });

  it('queries podcast/youtube sources ordered by name and the episode fields it aggregates', async () => {
    render(await PodcastFeedsPage());

    expect(fake.from).toHaveBeenCalledWith('news_sources');
    const [sourcesBuilder] = fake.__buildersFor('news_sources');
    expect(sourcesBuilder.select).toHaveBeenCalledWith(
      'id, name, source_type, transcribe_with_deepgram, last_scanned_at, image_url',
    );
    expect(sourcesBuilder.in).toHaveBeenCalledWith('source_type', ['podcast', 'youtube']);
    expect(sourcesBuilder.order).toHaveBeenCalledWith('name', { ascending: true });

    expect(fake.from).toHaveBeenCalledWith('podcast_episodes');
    const [episodesBuilder] = fake.__buildersFor('podcast_episodes');
    expect(episodesBuilder.select).toHaveBeenCalledWith('source_id, transcript_status, image_url, published_at');
  });

  it('shows an empty state linking to the sources page when there are no sources', async () => {
    render(await PodcastFeedsPage());

    expect(screen.getByText(/No podcast or YouTube sources yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'news sources page' })).toHaveAttribute('href', '/news/sources');
  });
});
