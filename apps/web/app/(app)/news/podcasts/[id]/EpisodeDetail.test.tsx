import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { EpisodeDetail } from './EpisodeDetail';
import type { PodcastEpisode, TranscriptSegment } from '@platform/shared';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock('@/app/actions/podcasts', () => ({
  requestEpisodeAction: vi.fn(async () => ({})),
}));

// Minimal audio-only episode (no youtube_url) with sensible defaults; each test
// overrides the fields it exercises.
function makeEpisode(overrides: Partial<PodcastEpisode> = {}): PodcastEpisode {
  return {
    id: 'ep-1',
    source_id: null,
    guid: 'guid-1',
    title: 'Sound money weekly',
    description: null,
    episode_url: null,
    audio_url: 'https://example.com/episode.mp3',
    audio_mime_type: 'audio/mpeg',
    duration_seconds: null,
    youtube_url: null,
    season: null,
    episode_number: null,
    image_url: null,
    published_at: null,
    transcript_status: 'skipped',
    transcript_source: null,
    transcript_format: null,
    transcript_lang: null,
    transcript_text: null,
    transcript_raw_url: null,
    has_timestamps: false,
    deepgram_request_id: null,
    transcript_error: null,
    ingestion_origin: 'feed',
    curator_note: null,
    topic_tags: [],
    transcript_fetched_at: null,
    embedded_at: null,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeSegment(overrides: Partial<TranscriptSegment> = {}): TranscriptSegment {
  return {
    id: 'seg-1',
    episode_id: 'ep-1',
    segment_index: 0,
    start_seconds: 0,
    end_seconds: 5,
    speaker: null,
    content: 'Welcome to the show.',
    token_count: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// jsdom doesn't compute layout, so scrollHeight/clientHeight are 0 and the
// clamp never triggers. These helpers force an overflow so the show-more
// control appears.
function forceTranscriptOverflow() {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, value: 2000 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 480 });
}
function clearLayoutOverrides() {
  // @ts-expect-error — remove the ad-hoc override so other tests see jsdom defaults
  delete HTMLElement.prototype.scrollHeight;
  // @ts-expect-error — same for clientHeight
  delete HTMLElement.prototype.clientHeight;
}

describe('EpisodeDetail', () => {
  afterEach(clearLayoutOverrides);

  it('renders the show artwork when the episode has an image_url', () => {
    const { container } = render(
      <EpisodeDetail
        episode={makeEpisode({ image_url: 'https://example.com/art.jpg' })}
        segments={[]}
        sourceName={null}
      />,
    );

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'https://example.com/art.jpg');
  });

  it('falls back to the branded placeholder when there is no image and no video', () => {
    const { container } = render(
      <EpisodeDetail episode={makeEpisode({ image_url: null })} segments={[]} sourceName={null} />,
    );

    // No <img>; the branded placeholder renders an inline SVG mark instead.
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
    // Audio player is still present for the audio-only episode.
    expect(container.querySelector('audio')).not.toBeNull();
  });

  it('renders the episode description when present', () => {
    render(
      <EpisodeDetail
        episode={makeEpisode({ description: 'A calm look at treasury strategy.' })}
        segments={[]}
        sourceName={null}
      />,
    );

    expect(screen.getByText('A calm look at treasury strategy.')).toBeInTheDocument();
  });

  it('strips HTML markup from feed-supplied descriptions', () => {
    render(
      <EpisodeDetail
        episode={makeEpisode({
          description: '<p>A calm look at <strong>treasury</strong> strategy. <a href="https://x.co">More</a></p>',
        })}
        segments={[]}
        sourceName={null}
      />,
    );

    expect(screen.getByText('A calm look at treasury strategy. More')).toBeInTheDocument();
    expect(screen.queryByText(/<p>|<strong>/)).not.toBeInTheDocument();
  });

  it('does not show a transcript toggle when the transcript fits', () => {
    render(
      <EpisodeDetail
        episode={makeEpisode({ transcript_status: 'available' })}
        segments={[makeSegment()]}
        sourceName={null}
      />,
    );

    expect(screen.getByText('Welcome to the show.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show full transcript' })).not.toBeInTheDocument();
  });

  it('collapses an overflowing transcript and toggles on click', () => {
    forceTranscriptOverflow();
    render(
      <EpisodeDetail
        episode={makeEpisode({ transcript_status: 'available' })}
        segments={[makeSegment()]}
        sourceName={null}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Show full transcript' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.getByRole('button', { name: 'Show full transcript' })).toBeInTheDocument();
  });
});
