import { describe, it, expect } from 'vitest';
import { extractVideoId } from './youtube.js';

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
