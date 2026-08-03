import { describe, it, expect, vi, beforeEach } from 'vitest';

const segmentSearchMock = vi.fn();
vi.mock('@platform/db', () => ({
  segmentSearch: (...args: unknown[]) => segmentSearchMock(...args),
}));

const embeddingsCreate = vi.fn(async () => ({ data: [{ embedding: [0.1, 0.2] }] }));
vi.mock('openai', () => ({
  default: class {
    embeddings = { create: embeddingsCreate };
  },
}));

const { searchSegments } = await import('./segments.js');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (input: Record<string, unknown>) => (searchSegments as any).execute(input);

const reportHit = {
  source_type: 'report',
  segment_id: 'seg1',
  parent_id: 'r1',
  parent_title: 'Q2 2026 Institutional Flows',
  locator: 'p. 14',
  content: 'Institutional flows rose 22% quarter on quarter.',
  redistribution: 'internal_only',
  similarity: 0.71,
};

const transcriptHit = {
  source_type: 'transcript',
  segment_id: 'seg2',
  parent_id: 'e1',
  parent_title: 'What Bitcoin Did #900',
  locator: 'start 930s',
  content: 'The guest argued that treasury adoption is accelerating.',
  redistribution: null,
  similarity: 0.64,
};

beforeEach(() => {
  segmentSearchMock.mockReset();
  embeddingsCreate.mockClear();
  segmentSearchMock.mockResolvedValue([reportHit, transcriptHit]);
});

describe('search_segments', () => {
  it('embeds the query and searches both corpora by default', async () => {
    const result = await run({ query: 'institutional flows', limit: 10 });

    expect(embeddingsCreate).toHaveBeenCalledOnce();
    expect(segmentSearchMock.mock.calls[0][1]).toMatchObject({ count: 10 });
    expect(segmentSearchMock.mock.calls[0][1].sourceTypes).toBeUndefined();
    expect(result.count).toBe(2);
  });

  it('spells out the redistribution restriction on every row', async () => {
    const result = await run({ query: 'flows', limit: 5 });

    // A restriction the model has to look up is one it will get wrong. The
    // failure mode: three paragraphs of a publisher's prose in a LinkedIn post.
    expect(result.results[0].redistribution).toBe('internal_only');
    expect(result.results[0].usage).toContain('INTERNAL ONLY');
    expect(result.results[0].usage).toContain('do not quote');
  });

  it('leaves usage null for transcript hits, which carry no licence', async () => {
    const result = await run({ query: 'flows', limit: 5 });
    expect(result.results[1].redistribution).toBeNull();
    expect(result.results[1].usage).toBeNull();
  });

  it('carries the locator through so a citation is always constructible', async () => {
    const result = await run({ query: 'flows', limit: 5 });
    expect(result.results[0].locator).toBe('p. 14');
    expect(result.results[1].locator).toBe('start 930s');
  });

  it('passes a corpus restriction through', async () => {
    await run({ query: 'flows', source_types: ['report'], limit: 5 });
    expect(segmentSearchMock.mock.calls[0][1].sourceTypes).toEqual(['report']);
  });

  it('returns an empty result set without inventing rows', async () => {
    segmentSearchMock.mockResolvedValue([]);
    const result = await run({ query: 'nothing matches this', limit: 5 });
    expect(result).toEqual({ count: 0, results: [] });
  });
});
