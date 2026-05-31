import { describe, it, expect } from 'vitest';
import { chunkText } from './contentEmbeddings.js';

describe('chunkText', () => {
  it('returns a single chunk for short text', () => {
    expect(chunkText('a short summary')).toEqual(['a short summary']);
  });

  it('returns no chunks for empty/whitespace text', () => {
    expect(chunkText('   ')).toEqual([]);
    expect(chunkText('')).toEqual([]);
  });

  it('windows long text into overlapping chunks that cover the whole input', () => {
    const long = 'x'.repeat(5000);
    const chunks = chunkText(long);
    expect(chunks.length).toBeGreaterThan(1);
    // Every chunk respects the max size.
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(512 * 4);
    // Last chunk reaches the end of the input.
    expect(long.endsWith(chunks[chunks.length - 1]!)).toBe(true);
  });
});
