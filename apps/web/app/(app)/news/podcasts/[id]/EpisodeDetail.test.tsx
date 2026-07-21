import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { EpisodeDetail } from './EpisodeDetail';
import type { PodcastEpisode, TranscriptSegment } from '@platform/shared';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
const generateEpisodeBrief = vi.fn(async () => ({ success: true }));
const decideEpisodeBrief = vi.fn(async () => ({ success: true }));
vi.mock('@/app/actions/podcasts', () => ({
  requestEpisodeAction: vi.fn(async () => ({})),
  generateEpisodeBrief: (...args: unknown[]) => generateEpisodeBrief(...(args as [])),
  decideEpisodeBrief: (...args: unknown[]) => decideEpisodeBrief(...(args as [])),
}));

// jsdom implements neither of these; the in-transcript find effect calls
// scrollIntoView, and copy-with-citation writes to the clipboard.
const writeText = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
  writeText.mockClear();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
});

// Minimal audio-only episode (no youtube_url) with sensible defaults; each test
// overrides the fields it exercises.
function makeEpisode(overrides: Partial<PodcastEpisode> = {}): PodcastEpisode {
  return {
    id: 'ep-1',
    slug: 'sound-money-weekly',
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
    episode_summary: null,
    key_takeaways: [],
    chapters: [],
    summary_status: 'none',
    summary_lex_verdict: null,
    summary_generated_at: null,
    summary_approved_at: null,
    summary_approved_by: null,
    relevance_score: null,
    category: null,
    relevance_metadata: null,
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

  it('highlights in-transcript matches and reports a count', () => {
    const { container } = render(
      <EpisodeDetail
        episode={makeEpisode({ transcript_status: 'available' })}
        segments={[makeSegment({ content: 'Bitcoin treasury and bitcoin custody.' })]}
        sourceName={null}
      />,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Find in transcript' }), {
      target: { value: 'bitcoin' },
    });

    expect(container.querySelectorAll('mark')).toHaveLength(2);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('force-expands an overflowing transcript while searching', () => {
    forceTranscriptOverflow();
    render(
      <EpisodeDetail
        episode={makeEpisode({ transcript_status: 'available' })}
        segments={[makeSegment({ content: 'Bitcoin treasury.' })]}
        sourceName={null}
      />,
    );

    // The show-more control is present until a query is active.
    expect(screen.getByRole('button', { name: 'Show full transcript' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find in transcript' }), {
      target: { value: 'bitcoin' },
    });
    expect(screen.queryByRole('button', { name: 'Show full transcript' })).not.toBeInTheDocument();
  });

  it('copies a segment quote with citation', () => {
    render(
      <EpisodeDetail
        episode={makeEpisode({ transcript_status: 'available', title: 'Sound money weekly' })}
        segments={[makeSegment({ content: 'Custody matters.', speaker: 'Guest', start_seconds: 75 })]}
        sourceName={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy quote with citation' }));
    expect(writeText).toHaveBeenCalledWith('"Custody matters." — Guest, Sound money weekly @ 1:15');
  });

  describe('episode brief', () => {
    beforeEach(() => {
      generateEpisodeBrief.mockClear();
      decideEpisodeBrief.mockClear();
    });

    it('offers a Generate brief action once a transcript is available', () => {
      render(
        <EpisodeDetail
          episode={makeEpisode({ transcript_status: 'available' })}
          segments={[makeSegment()]}
          sourceName={null}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Generate brief' }));
      expect(generateEpisodeBrief).toHaveBeenCalledWith('ep-1');
    });

    it('does not offer a brief action when there is no transcript yet', () => {
      render(<EpisodeDetail episode={makeEpisode({ transcript_status: 'skipped' })} segments={[]} sourceName={null} />);

      expect(screen.queryByRole('button', { name: 'Generate brief' })).not.toBeInTheDocument();
      expect(screen.queryByText('Episode brief')).not.toBeInTheDocument();
    });

    it('shows a proposed draft with its compliance verdict and approve/reject controls', () => {
      render(
        <EpisodeDetail
          episode={makeEpisode({
            transcript_status: 'available',
            summary_status: 'proposed',
            episode_summary: 'The host discussed board-level custody decisions.',
            summary_lex_verdict: {
              passes: false,
              flags: [{ quote: 'a buying opportunity', issue: 'reads as a buy signal' }],
              rationale: 'One phrase frames the market as advice.',
              suggested_rewrite: null,
            },
          })}
          segments={[makeSegment()]}
          sourceName={null}
        />,
      );

      expect(screen.getByText('The host discussed board-level custody decisions.')).toBeInTheDocument();
      expect(screen.getByText('Draft · team only')).toBeInTheDocument();
      expect(screen.getByText('Compliance needs review')).toBeInTheDocument();
      expect(screen.getByText(/reads as a buy signal/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Approve and publish' }));
      expect(decideEpisodeBrief).toHaveBeenCalledWith('ep-1', 'approve');
    });

    it('renders an approved brief without draft controls', () => {
      render(
        <EpisodeDetail
          episode={makeEpisode({
            transcript_status: 'available',
            summary_status: 'approved',
            episode_summary: 'A concise, published brief.',
          })}
          segments={[makeSegment()]}
          sourceName={null}
        />,
      );

      expect(screen.getByText('A concise, published brief.')).toBeInTheDocument();
      expect(screen.queryByText('Draft · team only')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Approve and publish' })).not.toBeInTheDocument();
    });

    it('renders key takeaways, deep-linking timestamped ones to the media', () => {
      render(
        <EpisodeDetail
          episode={makeEpisode({
            transcript_status: 'available',
            summary_status: 'approved',
            episode_summary: 'A concise, published brief.',
            key_takeaways: [
              { text: 'Custody is a board decision.', start_seconds: 90 },
              { text: 'A point with no timestamp.', start_seconds: null },
            ],
          })}
          segments={[makeSegment()]}
          sourceName={null}
        />,
      );

      expect(screen.getByText('Key takeaways')).toBeInTheDocument();
      expect(screen.getByText('Custody is a board decision.')).toBeInTheDocument();
      // Timestamped takeaway renders a seek button; the untimed one does not.
      expect(screen.getByRole('button', { name: '1:30' })).toBeInTheDocument();
      expect(screen.getByText('A point with no timestamp.')).toBeInTheDocument();
    });

    it('renders a chapter rail that deep-links into the media', () => {
      render(
        <EpisodeDetail
          episode={makeEpisode({
            transcript_status: 'available',
            summary_status: 'approved',
            episode_summary: 'A concise, published brief.',
            chapters: [
              { title: 'Introduction', start_seconds: 0 },
              { title: 'Custody', start_seconds: 90 },
            ],
          })}
          segments={[makeSegment()]}
          sourceName={null}
        />,
      );

      expect(screen.getByText('Chapters')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Custody/ })).toBeInTheDocument();
      expect(screen.getByText('Introduction')).toBeInTheDocument();
    });

    it('shows category and relevance in provenance when scored', () => {
      render(
        <EpisodeDetail
          episode={makeEpisode({ transcript_status: 'available', category: 'macro', relevance_score: 0.82 })}
          segments={[makeSegment()]}
          sourceName={null}
        />,
      );

      expect(screen.getByText('Category')).toBeInTheDocument();
      expect(screen.getByText('Macro')).toBeInTheDocument();
      expect(screen.getByText('Relevance')).toBeInTheDocument();
      expect(screen.getByText('0.82')).toBeInTheDocument();
    });

    it('omits category and relevance from provenance when unscored', () => {
      render(<EpisodeDetail episode={makeEpisode({ transcript_status: 'available' })} segments={[makeSegment()]} sourceName={null} />);

      expect(screen.queryByText('Category')).not.toBeInTheDocument();
      expect(screen.queryByText('Relevance')).not.toBeInTheDocument();
    });

    it('shows no takeaways block when there are none', () => {
      render(
        <EpisodeDetail
          episode={makeEpisode({
            transcript_status: 'available',
            summary_status: 'approved',
            episode_summary: 'A concise, published brief.',
            key_takeaways: [],
          })}
          segments={[makeSegment()]}
          sourceName={null}
        />,
      );

      expect(screen.queryByText('Key takeaways')).not.toBeInTheDocument();
    });
  });
});
