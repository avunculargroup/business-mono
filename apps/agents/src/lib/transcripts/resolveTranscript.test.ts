import { describe, it, expect, beforeEach, vi } from 'vitest';

const { fetchText, fetchYoutubeSegments, dgExecute } = vi.hoisted(() => ({
  fetchText: vi.fn(),
  fetchYoutubeSegments: vi.fn(),
  dgExecute: vi.fn(),
}));

vi.mock('../fetchFeed.js', () => ({ fetchText }));
vi.mock('../../tools/youtube.js', () => ({ fetchYoutubeSegments }));
vi.mock('../../tools/deepgram.js', () => ({ deepgramTranscribe: { execute: dgExecute } }));

const { resolveTranscript } = await import('./resolveTranscript.js');

const source = {
  transcribe_with_deepgram: false,
  preferred_transcript_lang: 'en',
  max_episode_age_days: null as number | null,
};

describe('resolveTranscript waterfall', () => {
  beforeEach(() => {
    fetchText.mockReset();
    fetchYoutubeSegments.mockReset();
    dgExecute.mockReset();
  });

  it('1. uses the feed transcript tag when present (short-circuits)', async () => {
    fetchText.mockResolvedValue('WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello');
    const out = await resolveTranscript(
      { transcriptTags: [{ url: 'https://x/t.vtt', mimeType: 'text/vtt' }], youtube_url: 'https://youtu.be/dQw4w9WgXcQ' },
      source,
    );
    expect(out.kind).toBe('available');
    if (out.kind === 'available') {
      expect(out.source).toBe('feed_tag');
      expect(out.format).toBe('vtt');
      expect(out.hasTimestamps).toBe(true);
    }
    // YouTube must not be consulted once the feed tag wins.
    expect(fetchYoutubeSegments).not.toHaveBeenCalled();
  });

  it('2. falls through to YouTube when the feed tag fetch fails', async () => {
    fetchText.mockRejectedValue(new Error('403'));
    fetchYoutubeSegments.mockResolvedValue({
      videoId: 'v', title: 't', channel: 'c', language: 'en',
      segments: [{ start: 0, end: 2.5, text: 'spoken words' }],
    });
    const out = await resolveTranscript(
      { transcriptTags: [{ url: 'https://x/t.vtt', mimeType: 'text/vtt' }], youtube_url: 'https://youtu.be/dQw4w9WgXcQ' },
      source,
    );
    expect(out.kind).toBe('available');
    if (out.kind === 'available') {
      expect(out.source).toBe('youtube');
      expect(out.hasTimestamps).toBe(true);
      expect(out.language).toBe('en');
      expect(out.segments[0]).toMatchObject({ start: 0, end: 2.5, text: 'spoken words' });
    }
    // The per-feed preferred language must reach the YouTube fetch.
    expect(fetchYoutubeSegments).toHaveBeenCalledWith('https://youtu.be/dQw4w9WgXcQ', 'en');
  });

  it('3. falls through to Deepgram (opted in) when YouTube has no captions', async () => {
    fetchYoutubeSegments.mockRejectedValue(new Error('no captions'));
    dgExecute.mockResolvedValue({ requestId: 'dg_123' });
    const out = await resolveTranscript(
      { youtube_url: 'https://youtu.be/dQw4w9WgXcQ', audio_url: 'https://x/a.mp3' },
      { ...source, transcribe_with_deepgram: true },
    );
    expect(out).toEqual({ kind: 'transcribing', deepgramRequestId: 'dg_123' });
    expect(dgExecute).toHaveBeenCalledTimes(1);
  });

  it('4. skips when nothing free is available and Deepgram is off', async () => {
    const out = await resolveTranscript({ audio_url: 'https://x/a.mp3' }, source);
    expect(out).toEqual({ kind: 'skipped' });
    expect(dgExecute).not.toHaveBeenCalled();
  });

  it('5. skips Deepgram for episodes older than the age cap', async () => {
    const out = await resolveTranscript(
      { audio_url: 'https://x/a.mp3', published_at: '2000-01-01T00:00:00.000Z' },
      { ...source, transcribe_with_deepgram: true, max_episode_age_days: 30 },
    );
    expect(out).toEqual({ kind: 'skipped' });
    expect(dgExecute).not.toHaveBeenCalled();
  });

  it('6. reports failed when the Deepgram submit throws', async () => {
    dgExecute.mockRejectedValue(new Error('deepgram down'));
    const out = await resolveTranscript(
      { audio_url: 'https://x/a.mp3' },
      { ...source, transcribe_with_deepgram: true },
    );
    expect(out.kind).toBe('failed');
    if (out.kind === 'failed') expect(out.error).toContain('deepgram down');
  });
});
