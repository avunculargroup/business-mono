import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseResponse } from '../../test/mocks/supabase.js';

// ── Mocks ──────────────────────────────────────────────────────────────────────
// ingestNewsItem hits news_items three times (ingestion_ref check, url check,
// insert) with different needed responses, so the shared single-response fake
// won't do — drive it from a per-call queue. rpc backs the semantic-dedup
// vector search.

const insertedRows: Array<Record<string, unknown>> = [];
let responseQueue: SupabaseResponse[] = [];
const rpcMock = vi.fn(async () => ({ data: [] as unknown[], error: null }));

function nextResponse(): SupabaseResponse {
  return responseQueue.shift() ?? { data: null, error: null };
}

const fakeSupabase = {
  from: vi.fn(() => {
    const resp = nextResponse();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.limit = vi.fn(() => b);
    b.single = vi.fn(() => Promise.resolve(resp));
    b.insert = vi.fn((row: Record<string, unknown>) => {
      insertedRows.push(row);
      return b;
    });
    b.then = (onFulfilled: (v: SupabaseResponse) => unknown) => Promise.resolve(resp).then(onFulfilled);
    return b;
  }),
  rpc: rpcMock,
};

const embedMock = vi.fn(async () => [0.1, 0.2, 0.3]);
const scoreMock = vi.fn();

vi.mock('@platform/db', () => ({ get supabase() { return fakeSupabase; } }));
vi.mock('../lib/embedText.js', () => ({ embedText: embedMock }));
vi.mock('./newsRubric.js', () => ({
  scoreNewsItem: scoreMock,
  RUBRIC_VERSION: 'v1',
}));

const { ingestNewsItem, mergeTopics } = await import('./ingestNewsItem.js');

const SCORED = {
  relevanceScore: 0.84,
  dimensionScores: { material: 0.95, novelty: 0.7, citation: 0.8 },
  relevanceReasoning: 'central to the debasement thesis',
  summary: 'Gromen argues net interest expense crossed defence spending.',
  topics: ['fiscal-dominance', 'treasury-issuance'],
  suggestedCuratorNotes: 'Useful for the AU CFO macro brief.',
  flags: [] as string[],
  needsHumanReview: false,
  rubricVersion: 'v1',
};

function baseInput() {
  return {
    source: { id: 'src-1', name: 'Gromen Tree Rings', tier: 'tier_1' },
    title: 'Tree Rings — Treasury issuance',
    body: 'Long body about fiscal dominance and treasury issuance dynamics.',
    fallbackSummary: 'Fallback summary',
    category: 'macro' as const,
    keyPoints: ['point a', 'point b'],
    topicTags: ['macro', 'Debasement'],
    australianRelevance: false,
    author: 'Luke Gromen',
    publishedAt: '2026-06-10T00:00:00.000Z',
    url: 'https://mail.local/gromen/abc123',
    canonicalUrl: 'https://tree-rings.example/view/123',
    ingestionRef: 'msg-abc-123@mail',
    hasPdfAttachment: false,
    attachmentCount: 0,
  };
}

beforeEach(() => {
  insertedRows.length = 0;
  responseQueue = [];
  fakeSupabase.from.mockClear();
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: [], error: null });
  embedMock.mockClear();
  embedMock.mockResolvedValue([0.1, 0.2, 0.3]);
  scoreMock.mockReset();
  scoreMock.mockResolvedValue(SCORED);
});

describe('mergeTopics', () => {
  it('dedupes case-insensitively, preserves order, drops blanks', () => {
    expect(mergeTopics(['Macro', 'etf'], ['macro', 'TREASURY', '  '])).toEqual(['macro', 'etf', 'treasury']);
  });
});

describe('ingestNewsItem', () => {
  it('skips on a matching ingestion_ref without embedding or inserting', async () => {
    responseQueue = [{ data: [{ id: 'existing' }], error: null }]; // ingestion_ref hit
    const res = await ingestNewsItem(baseInput());
    expect(res).toEqual({ status: 'duplicate', reason: 'ingestion_ref' });
    expect(embedMock).not.toHaveBeenCalled();
    expect(insertedRows).toHaveLength(0);
  });

  it('skips on an exact url match', async () => {
    responseQueue = [
      { data: [], error: null },               // ingestion_ref miss
      { data: [{ id: 'existing' }], error: null }, // url hit
    ];
    const res = await ingestNewsItem(baseInput());
    expect(res).toEqual({ status: 'duplicate', reason: 'url' });
    expect(scoreMock).not.toHaveBeenCalled();
    expect(insertedRows).toHaveLength(0);
  });

  it('skips on a semantic near-duplicate (>= 0.88)', async () => {
    responseQueue = [
      { data: [], error: null }, // ingestion_ref miss
      { data: [], error: null }, // url miss
    ];
    rpcMock.mockResolvedValue({ data: [{ title: 'Same story', summary: 's', similarity: 0.91, published_at: null }], error: null });
    const res = await ingestNewsItem(baseInput());
    expect(res).toEqual({ status: 'duplicate', reason: 'semantic' });
    expect(scoreMock).not.toHaveBeenCalled();
    expect(insertedRows).toHaveLength(0);
  });

  it('inserts a scored item and persists the rubric output', async () => {
    responseQueue = [
      { data: [], error: null },                 // ingestion_ref miss
      { data: [], error: null },                 // url miss
      { data: { id: 'news-1' }, error: null },   // insert .select().single()
    ];
    const res = await ingestNewsItem(baseInput());

    expect(res.status).toBe('inserted');
    expect(res.newsItemId).toBe('news-1');
    expect(res.relevanceScore).toBe(0.84);
    expect(res.scoringFailed).toBe(false);

    expect(insertedRows).toHaveLength(1);
    const row = insertedRows[0];
    expect(row).toMatchObject({
      source_id: 'src-1',
      ingestion_ref: 'msg-abc-123@mail',
      canonical_url: 'https://tree-rings.example/view/123',
      author: 'Luke Gromen',
      summary: SCORED.summary,                 // rubric summary wins over fallback
      relevance_score: 0.84,
      relevance_reasoning: SCORED.relevanceReasoning,
      curator_notes: SCORED.suggestedCuratorNotes,
      category: 'macro',
      status: 'new',
    });
    // topics merged from extractor + rubric, deduped/lowercased
    expect(row['topic_tags']).toEqual(['macro', 'debasement', 'fiscal-dominance', 'treasury-issuance']);
    expect(row['rex_metadata']).toMatchObject({
      dimension_scores: SCORED.dimensionScores,
      needs_human_review: false,
      rubric_version: 'v1',
    });
  });

  it('passes the vector-search neighbours to the scorer for the novelty check', async () => {
    responseQueue = [
      { data: [], error: null },
      { data: [], error: null },
      { data: { id: 'news-2' }, error: null },
    ];
    rpcMock.mockResolvedValue({ data: [{ title: 'Prior Gromen piece', summary: 'older', similarity: 0.6, published_at: '2026-05-01' }], error: null });
    await ingestNewsItem(baseInput());
    expect(scoreMock).toHaveBeenCalledWith(
      expect.objectContaining({
        similar: [{ title: 'Prior Gromen piece', summary: 'older', similarity: 0.6, published_at: '2026-05-01' }],
      }),
    );
  });

  it('still persists when scoring fails, with a null score and a scoring_failed flag', async () => {
    responseQueue = [
      { data: [], error: null },
      { data: [], error: null },
      { data: { id: 'news-3' }, error: null },
    ];
    scoreMock.mockResolvedValue(null);
    const res = await ingestNewsItem(baseInput());
    expect(res.status).toBe('inserted');
    expect(res.scoringFailed).toBe(true);
    expect(res.relevanceScore).toBeNull();
    const row = insertedRows[0];
    expect(row['relevance_score']).toBeNull();
    expect(row['summary']).toBe('Fallback summary'); // falls back to extractor summary
    expect(row['rex_metadata']).toEqual({ rubric_version: 'v1', scoring_failed: true });
  });

  it('treats a unique-violation race on insert as a duplicate', async () => {
    responseQueue = [
      { data: [], error: null },
      { data: [], error: null },
      { data: null, error: { code: '23505', message: 'duplicate key' } as { message: string } },
    ];
    const res = await ingestNewsItem(baseInput());
    expect(res.status).toBe('duplicate');
    expect(res.reason).toBe('unique_violation');
  });

  it('does not run the ingestion_ref check when no ref is provided', async () => {
    responseQueue = [
      { data: [], error: null },               // url miss (first news_items call)
      { data: { id: 'news-4' }, error: null }, // insert
    ];
    const input = { ...baseInput(), ingestionRef: null };
    const res = await ingestNewsItem(input);
    expect(res.status).toBe('inserted');
    const row = insertedRows[0];
    expect(row['ingestion_ref']).toBeNull();
  });
});
