import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TranscriptSearch } from './TranscriptSearch';
import { searchTranscripts, type TranscriptSearchHit } from '@/app/actions/podcastSearch';

vi.mock('@/app/actions/podcastSearch', () => ({
  searchTranscripts: vi.fn(),
}));

const mockedSearch = vi.mocked(searchTranscripts);

function makeHit(overrides: Partial<TranscriptSearchHit> = {}): TranscriptSearchHit {
  return {
    segment_id: 'seg-1',
    episode_id: 'ep-1',
    episode_title: 'Sound money weekly',
    source_name: 'The Treasury Show',
    start_seconds: 1394,
    end_seconds: 1420,
    speaker: 'Guest',
    content: 'Companies increasingly hold bitcoin as a treasury reserve asset.',
    youtube_url: null,
    audio_url: 'https://example.com/ep.mp3',
    curator_note: null,
    published_at: '2026-05-01T00:00:00Z',
    similarity: 0.82,
    ...overrides,
  };
}

beforeEach(() => {
  mockedSearch.mockReset();
});

async function submitQuery(query: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search transcripts' }), {
    target: { value: query },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
}

describe('TranscriptSearch', () => {
  it('shows the initial prompt before any search', () => {
    render(<TranscriptSearch />);
    expect(screen.getByText('Search the transcript library')).toBeInTheDocument();
  });

  it('disables the button until the query is long enough', () => {
    render(<TranscriptSearch />);
    const button = screen.getByRole('button', { name: 'Search' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'bitcoin' } });
    expect(button).toBeEnabled();
  });

  it('renders ranked segments with a timestamped deep-link on success', async () => {
    mockedSearch.mockResolvedValue({ results: [makeHit()] });
    render(<TranscriptSearch />);
    await submitQuery('how are companies accounting for bitcoin');

    expect(await screen.findByText(/treasury reserve asset/)).toBeInTheDocument();
    expect(screen.getByText('82% match')).toBeInTheDocument();
    // Deep-links to the episode at the matched moment (23:14 → 1394s).
    const play = screen.getByRole('link', { name: /Play at 23:14/ });
    expect(play).toHaveAttribute('href', '/news/podcasts/ep-1?t=1394');
    expect(mockedSearch).toHaveBeenCalledWith('how are companies accounting for bitcoin');
  });

  it('links to the episode without a timestamp when the segment has none', async () => {
    mockedSearch.mockResolvedValue({ results: [makeHit({ start_seconds: null })] });
    render(<TranscriptSearch />);
    await submitQuery('custody providers');

    const open = await screen.findByRole('link', { name: /Open episode/ });
    expect(open).toHaveAttribute('href', '/news/podcasts/ep-1');
  });

  it('shows a no-results state when nothing matches', async () => {
    mockedSearch.mockResolvedValue({ results: [] });
    render(<TranscriptSearch />);
    await submitQuery('something obscure');

    expect(await screen.findByText('No matching passages')).toBeInTheDocument();
  });

  it('surfaces an error message from the action', async () => {
    mockedSearch.mockResolvedValue({ error: 'Search is unavailable right now.' });
    render(<TranscriptSearch />);
    await submitQuery('anything at all');

    expect(await screen.findByText('Search is unavailable right now.')).toBeInTheDocument();
  });
});
