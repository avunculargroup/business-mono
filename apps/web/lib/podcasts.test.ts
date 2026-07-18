import { describe, it, expect } from 'vitest';

import {
  extractVideoId,
  youtubeThumbnail,
  youtubeEmbedUrl,
  formatTimestamp,
  htmlToText,
  estimateDeepgramCost,
  formatAud,
  highlightText,
  DEEPGRAM_COST_PER_MINUTE_AUD,
} from './podcasts';

describe('extractVideoId', () => {
  it('returns a bare 11-character ID unchanged', () => {
    expect(extractVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('parses a standard watch URL', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('parses a watch URL with extra query params', () => {
    expect(extractVideoId('https://youtube.com/watch?list=abc&v=dQw4w9WgXcQ&t=10s')).toBe(
      'dQw4w9WgXcQ',
    );
  });

  it('parses a youtu.be short link', () => {
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('parses embed, /v/ and shorts URLs', () => {
    expect(extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('https://www.youtube.com/v/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('trims surrounding whitespace', () => {
    expect(extractVideoId('  dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ');
  });

  it('returns null for empty / nullish input', () => {
    expect(extractVideoId(null)).toBeNull();
    expect(extractVideoId(undefined)).toBeNull();
    expect(extractVideoId('')).toBeNull();
  });

  it('returns null for an unrecognised URL', () => {
    expect(extractVideoId('https://example.com/not-a-video')).toBeNull();
  });
});

describe('youtubeThumbnail', () => {
  it('builds the hqdefault poster URL', () => {
    expect(youtubeThumbnail('dQw4w9WgXcQ')).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    );
  });
});

describe('youtubeEmbedUrl', () => {
  it('uses the no-cookie host with autoplay and rel=0', () => {
    expect(youtubeEmbedUrl('dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0',
    );
  });

  it('appends a floored start offset when provided', () => {
    expect(youtubeEmbedUrl('dQw4w9WgXcQ', 90.7)).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&start=90',
    );
  });

  it('omits start for zero / nullish offsets', () => {
    expect(youtubeEmbedUrl('dQw4w9WgXcQ', 0)).not.toContain('start');
    expect(youtubeEmbedUrl('dQw4w9WgXcQ', null)).not.toContain('start');
  });
});

describe('htmlToText', () => {
  it('strips inline tags and keeps the text', () => {
    expect(htmlToText('An <strong>important</strong> episode about <em>Bitcoin</em>.')).toBe(
      'An important episode about Bitcoin.',
    );
  });

  it('drops anchor tags but keeps their text', () => {
    expect(htmlToText('Read more at <a href="https://example.com">our site</a>.')).toBe(
      'Read more at our site.',
    );
  });

  it('turns paragraphs and <br> into line breaks', () => {
    expect(htmlToText('<p>First para.</p><p>Second para.<br>Same para new line.</p>')).toBe(
      'First para.\n\nSecond para.\nSame para new line.',
    );
  });

  it('decodes named and numeric entities', () => {
    expect(htmlToText('AT&amp;T &mdash; Q&#38;A &#x1F600;')).toBe('AT&T — Q&A 😀');
  });

  it('collapses excess whitespace and trims', () => {
    expect(htmlToText('  <div>  lots   of   space  </div>  ')).toBe('lots of space');
  });

  it('returns an empty string for nullish input', () => {
    expect(htmlToText(null)).toBe('');
    expect(htmlToText(undefined)).toBe('');
    expect(htmlToText('')).toBe('');
  });
});

describe('formatTimestamp', () => {
  it('formats sub-hour durations as M:SS', () => {
    expect(formatTimestamp(0)).toBe('0:00');
    expect(formatTimestamp(9)).toBe('0:09');
    expect(formatTimestamp(75)).toBe('1:15');
  });

  it('formats hour-plus durations as H:MM:SS', () => {
    expect(formatTimestamp(3661)).toBe('1:01:01');
  });

  it('floors fractional seconds', () => {
    expect(formatTimestamp(75.9)).toBe('1:15');
  });

  it('returns an empty string for nullish or NaN input', () => {
    expect(formatTimestamp(null)).toBe('');
    expect(formatTimestamp(undefined)).toBe('');
    expect(formatTimestamp(Number.NaN)).toBe('');
  });
});

describe('estimateDeepgramCost', () => {
  const now = new Date('2026-07-14T00:00:00Z');
  const ep = (over: Partial<Parameters<typeof estimateDeepgramCost>[0][number]>) => ({
    transcript_source: 'deepgram' as const,
    duration_seconds: 600,
    created_at: '2026-07-01T00:00:00Z',
    ...over,
  });

  it('only counts episodes transcribed by Deepgram', () => {
    const { allTime } = estimateDeepgramCost(
      [
        ep({}),
        ep({ transcript_source: 'youtube' }),
        ep({ transcript_source: 'feed_tag' }),
        ep({ transcript_source: null }),
      ],
      now,
    );
    // One 600s (10 min) deepgram episode.
    expect(allTime).toBeCloseTo(10 * DEEPGRAM_COST_PER_MINUTE_AUD, 6);
  });

  it('buckets this-month spend on created_at', () => {
    const { thisMonth, allTime } = estimateDeepgramCost(
      [
        ep({ duration_seconds: 600, created_at: '2026-07-10T00:00:00Z' }), // this month
        ep({ duration_seconds: 1200, created_at: '2026-06-10T00:00:00Z' }), // last month
      ],
      now,
    );
    expect(thisMonth).toBeCloseTo(10 * DEEPGRAM_COST_PER_MINUTE_AUD, 6);
    expect(allTime).toBeCloseTo(30 * DEEPGRAM_COST_PER_MINUTE_AUD, 6);
  });

  it('treats null / non-positive durations as zero', () => {
    const { allTime } = estimateDeepgramCost(
      [ep({ duration_seconds: null }), ep({ duration_seconds: 0 })],
      now,
    );
    expect(allTime).toBe(0);
  });
});

describe('formatAud', () => {
  it('formats to two decimals with an A$ prefix', () => {
    expect(formatAud(0)).toBe('A$0.00');
    expect(formatAud(12.3)).toBe('A$12.30');
    expect(formatAud(12.345)).toBe('A$12.35');
  });
});

describe('highlightText', () => {
  it('returns a single non-match part for an empty query', () => {
    expect(highlightText('hello world', '')).toEqual([{ text: 'hello world', match: false }]);
    expect(highlightText('hello world', '   ')).toEqual([{ text: 'hello world', match: false }]);
  });

  it('splits and flags case-insensitive matches', () => {
    expect(highlightText('Bitcoin and bitcoin', 'bitcoin')).toEqual([
      { text: 'Bitcoin', match: true },
      { text: ' and ', match: false },
      { text: 'bitcoin', match: true },
    ]);
  });

  it('escapes regex special characters in the query', () => {
    expect(highlightText('a (b) c', '(b)')).toEqual([
      { text: 'a ', match: false },
      { text: '(b)', match: true },
      { text: ' c', match: false },
    ]);
  });

  it('returns the whole string unflagged when there is no match', () => {
    expect(highlightText('nothing here', 'zzz')).toEqual([{ text: 'nothing here', match: false }]);
  });
});

import { computeKpis, computeSourceBreakdown, dailyCounts, episodeRecency, statusOptions } from './podcasts';

describe('computeKpis', () => {
  it('counts available, in-progress, needs-attention, and indexed', () => {
    const kpis = computeKpis([
      { transcript_status: 'available', embedded_at: '2026-01-01' },
      { transcript_status: 'transcribing', embedded_at: null },
      { transcript_status: 'failed', embedded_at: null },
      { transcript_status: 'skipped', embedded_at: null },
      { transcript_status: 'resolving', embedded_at: null },
    ]);
    expect(kpis).toEqual({ total: 5, available: 1, inProgress: 2, needsAttention: 2, indexed: 1 });
  });
});

describe('computeSourceBreakdown', () => {
  it('only counts available transcripts and buckets the rest as none', () => {
    const b = computeSourceBreakdown([
      { transcript_status: 'available', transcript_source: 'feed_tag' },
      { transcript_status: 'available', transcript_source: 'youtube' },
      { transcript_status: 'available', transcript_source: 'deepgram' },
      { transcript_status: 'available', transcript_source: null },
      { transcript_status: 'failed', transcript_source: null },
    ]);
    expect(b).toEqual({ feedTag: 1, youtube: 1, deepgram: 1, none: 2, total: 5 });
  });
});

describe('episodeRecency', () => {
  it('prefers published_at, falls back to created_at, then 0', () => {
    expect(episodeRecency({ published_at: '2026-01-02', created_at: '2026-01-01' })).toBe(
      new Date('2026-01-02').getTime(),
    );
    expect(episodeRecency({ published_at: null, created_at: '2026-01-01' })).toBe(
      new Date('2026-01-01').getTime(),
    );
    expect(episodeRecency({ published_at: null, created_at: null })).toBe(0);
  });
});

describe('dailyCounts', () => {
  it('returns one MM-DD bucket per day and tallies today', () => {
    const today = new Date().toISOString();
    const series = dailyCounts([{ created_at: today }, { created_at: today }], 7);
    expect(series).toHaveLength(7);
    expect(series.every((p) => /^\d{2}-\d{2}$/.test(p.date))).toBe(true);
    expect(series[series.length - 1].count).toBe(2);
  });
});

describe('statusOptions', () => {
  it('returns [value, label] pairs for every transcript status', () => {
    const opts = statusOptions();
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.every(([v, l]) => typeof v === 'string' && typeof l === 'string')).toBe(true);
  });
});
