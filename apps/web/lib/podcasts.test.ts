import { describe, it, expect } from 'vitest';

import {
  extractVideoId,
  youtubeThumbnail,
  youtubeEmbedUrl,
  formatTimestamp,
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
