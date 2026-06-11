import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

const fetchTranscript = vi.hoisted(() => vi.fn());
vi.mock('youtube-transcript', () => ({
  YoutubeTranscript: { fetchTranscript },
}));

const httpFetch = vi.fn();
vi.stubGlobal('fetch', httpFetch);

const { extractVideoId, fetchYoutubeSegments, youtubeTranscript } = await import('./youtube.js');

const watchPage = (title: string, channel: string) => ({
  ok: true,
  text: async () => `<title>${title} - YouTube</title>"ownerChannelName":"${channel}"`,
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('extractVideoId', () => {
  it('returns a bare 11-char ID unchanged', () => {
    expect(extractVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('  dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ');
  });

  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=10s', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/v/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('extracts the ID from %s', (input, expected) => {
    expect(extractVideoId(input)).toBe(expected);
  });

  it('returns null for inputs without a recognizable video ID', () => {
    expect(extractVideoId('https://example.com/video')).toBeNull();
    expect(extractVideoId('not a url at all')).toBeNull();
    expect(extractVideoId('')).toBeNull();
    // 10 chars — too short
    expect(extractVideoId('dQw4w9WgXc')).toBeNull();
    // 12 chars — too long (and contains an invalid char)
    expect(extractVideoId('dQw4w9WgXcQ!')).toBeNull();
  });
});

describe('fetchYoutubeSegments', () => {
  beforeEach(() => {
    fetchTranscript.mockReset();
    httpFetch.mockReset();
    httpFetch.mockResolvedValue(watchPage('Some Video', 'Some Channel'));
  });

  it('keeps second-based offsets, computes end times, and decodes entities', async () => {
    fetchTranscript.mockResolvedValue([
      { offset: 0, duration: 2.5, text: 'it&amp;#39;s &quot;bitcoin&quot;' },
      { offset: 2.5, duration: 3, text: 'hello' },
    ]);
    const res = await fetchYoutubeSegments('https://youtu.be/dQw4w9WgXcQ');
    expect(res.videoId).toBe('dQw4w9WgXcQ');
    expect(res.title).toBe('Some Video');
    expect(res.channel).toBe('Some Channel');
    expect(res.language).toBeNull();
    expect(res.segments).toEqual([
      { start: 0, end: 2.5, text: `it's "bitcoin"` },
      { start: 2.5, end: 5.5, text: 'hello' },
    ]);
  });

  it('detects millisecond offsets on long videos', async () => {
    fetchTranscript.mockResolvedValue([
      { offset: 0, duration: 4000, text: 'a' },
      { offset: 3_600_000, duration: 5000, text: 'b' },
    ]);
    const res = await fetchYoutubeSegments('dQw4w9WgXcQ');
    expect(res.segments).toEqual([
      { start: 0, end: 4, text: 'a' },
      { start: 3600, end: 3605, text: 'b' },
    ]);
  });

  it('detects millisecond units on short videos via segment duration (Shorts)', async () => {
    // All offsets stay under 36000, so the offset heuristic alone would
    // misread these ms values as seconds.
    fetchTranscript.mockResolvedValue([
      { offset: 0, duration: 4000, text: 'a' },
      { offset: 5000, duration: 4000, text: 'b' },
      { offset: 20000, duration: 3000, text: 'c' },
    ]);
    const res = await fetchYoutubeSegments('dQw4w9WgXcQ');
    expect(res.segments.map((s) => s.start)).toEqual([0, 5, 20]);
    expect(res.segments[2].end).toBe(23);
  });

  it('passes the preferred language to the caption fetch', async () => {
    fetchTranscript.mockResolvedValue([{ offset: 0, duration: 2, text: 'x' }]);
    const res = await fetchYoutubeSegments('dQw4w9WgXcQ', 'en');
    expect(fetchTranscript).toHaveBeenCalledWith('dQw4w9WgXcQ', { lang: 'en' });
    expect(res.language).toBe('en');
  });

  it('falls back to the default track when the requested language is missing', async () => {
    fetchTranscript
      .mockRejectedValueOnce(new Error('[YoutubeTranscript] 🚨 No transcripts are available in en'))
      .mockResolvedValueOnce([{ offset: 0, duration: 2, text: 'x' }]);
    const res = await fetchYoutubeSegments('dQw4w9WgXcQ', 'en');
    expect(fetchTranscript).toHaveBeenCalledTimes(2);
    expect(fetchTranscript).toHaveBeenLastCalledWith('dQw4w9WgXcQ');
    expect(res.language).toBeNull();
    expect(res.segments).toHaveLength(1);
  });

  it.each([
    ['[YoutubeTranscript] 🚨 Transcript is disabled on this video', /No transcript available/],
    ['[YoutubeTranscript] 🚨 The video is no longer available', /is unavailable/],
    ['[YoutubeTranscript] 🚨 YouTube is receiving too many requests', /rate-limiting/],
  ])('translates the library error "%s"', async (libraryMessage, expected) => {
    fetchTranscript.mockRejectedValue(new Error(libraryMessage));
    await expect(fetchYoutubeSegments('dQw4w9WgXcQ')).rejects.toThrow(expected);
  });

  it('throws a friendly error when the caption list is empty', async () => {
    fetchTranscript.mockResolvedValue([]);
    await expect(fetchYoutubeSegments('dQw4w9WgXcQ')).rejects.toThrow(/No transcript available/);
  });

  it('rejects inputs without a recognizable video ID', async () => {
    await expect(fetchYoutubeSegments('https://example.com/video')).rejects.toThrow(
      /Could not extract YouTube video ID/,
    );
    expect(fetchTranscript).not.toHaveBeenCalled();
  });

  it('falls back to placeholder metadata when the watch page fetch fails', async () => {
    httpFetch.mockRejectedValue(new Error('network down'));
    fetchTranscript.mockResolvedValue([{ offset: 0, duration: 2, text: 'x' }]);
    const res = await fetchYoutubeSegments('dQw4w9WgXcQ');
    expect(res.title).toBe('YouTube video dQw4w9WgXcQ');
    expect(res.channel).toBe('Unknown');
  });

  it('decodes entities in the scraped title and channel', async () => {
    httpFetch.mockResolvedValue(watchPage('Bitcoin &amp; Money', 'Ben &amp; Co'));
    fetchTranscript.mockResolvedValue([{ offset: 0, duration: 2, text: 'x' }]);
    const res = await fetchYoutubeSegments('dQw4w9WgXcQ');
    expect(res.title).toBe('Bitcoin & Money');
    expect(res.channel).toBe('Ben & Co');
  });
});

describe('youtube_transcript tool', () => {
  beforeEach(() => {
    fetchTranscript.mockReset();
    httpFetch.mockReset();
    httpFetch.mockResolvedValue(watchPage('Some Video', 'Some Channel'));
  });

  const run = (input: { videoUrl: string; lang?: string }) =>
    youtubeTranscript.execute!(input as never, {} as never) as Promise<{
      videoId: string;
      title: string;
      channel: string;
      duration: string;
      segmentCount: number;
      transcript: string;
      truncated: boolean;
    }>;

  it('formats timestamped lines with duration and segment count', async () => {
    fetchTranscript.mockResolvedValue([
      { offset: 0, duration: 2.5, text: 'hello' },
      { offset: 2.5, duration: 3, text: 'world' },
    ]);
    const res = await run({ videoUrl: 'dQw4w9WgXcQ' });
    expect(res.transcript).toBe('[0:00] hello\n[0:02] world');
    expect(res.duration).toBe('0:05');
    expect(res.segmentCount).toBe(2);
    expect(res.truncated).toBe(false);
  });

  it('flags truncation past the 50k character cap', async () => {
    fetchTranscript.mockResolvedValue([
      { offset: 0, duration: 5, text: 'a'.repeat(60_000) },
    ]);
    const res = await run({ videoUrl: 'dQw4w9WgXcQ' });
    expect(res.truncated).toBe(true);
    expect(res.transcript).toHaveLength(50_000);
  });
});
