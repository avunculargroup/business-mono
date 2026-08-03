import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';

let fakeSupabase: FakeSupabaseClient;
vi.mock('@platform/db', () => ({
  get supabase() {
    return fakeSupabase;
  },
}));

const extractMock = vi.fn();
vi.mock('../../workflows/newsExtract.js', () => ({
  extractNewsMetadata: (...args: unknown[]) => extractMock(...args),
}));

const ingestMock = vi.fn();
vi.mock('../../workflows/ingestNewsItem.js', () => ({
  ingestNewsItem: (...args: unknown[]) => ingestMock(...args),
}));

const { reportToNewsItem, REPORT_EXTRACT_SCOPE, REPORT_RUBRIC_SCOPE } = await import('./toNewsItem.js');

const input = (over: Record<string, unknown> = {}) => ({
  reportId: 'r1',
  sourceId: 's1',
  sourceName: 'River Financial',
  sourceTier: 'tier_1',
  title: 'Bitcoin Adoption Report 2026',
  body: 'Institutional flows continued to broaden through the quarter.',
  url: 'https://river.com/files/adoption-2026.pdf',
  canonicalUrl: 'https://river.com/reports/adoption-2026',
  publishedAt: '2026-07-15',
  fileFormat: 'pdf' as const,
  pageCount: 34,
  wordCount: 12_000,
  extractionQuality: 'good' as const,
  routineId: 'rt1',
  ...over,
});

const goodExtraction = {
  data: {
    category: 'corporate',
    summary: 'A summary of the report that is long enough to be useful to a reader.',
    key_points: ['a', 'b'],
    topic_tags: ['adoption', 'treasury-strategy'],
    australian_relevance: false,
    bitcoin_relevance: true,
  },
  reason: null,
};

beforeEach(() => {
  fakeSupabase = createFakeSupabase();
  extractMock.mockReset();
  ingestMock.mockReset();
  extractMock.mockResolvedValue(goodExtraction);
  ingestMock.mockResolvedValue({ status: 'inserted', newsItemId: 'n1', relevanceScore: 0.82 });
});

describe('reportToNewsItem', () => {
  it('runs extraction first to fill the NOT NULL category, then one ingest call', async () => {
    const result = await reportToNewsItem(input());

    expect(extractMock).toHaveBeenCalledOnce();
    // Both spec steps (createNewsItem, scoreWithRex) collapse into the existing
    // pipeline — no parallel scoring or persistence path.
    expect(ingestMock).toHaveBeenCalledOnce();
    expect(ingestMock.mock.calls[0][0]).toMatchObject({
      category: 'corporate',
      status: 'new',
      hasPdfAttachment: true,
      attachmentCount: 1,
      rubricScopeKey: REPORT_RUBRIC_SCOPE,
    });
    expect(extractMock.mock.calls[0][0]).toMatchObject({ scopeKey: REPORT_EXTRACT_SCOPE });
    expect(result).toMatchObject({ newsItemId: 'n1', relevanceScore: 0.82, status: 'inserted' });
  });

  it('passes extraction_quality into rex_metadata so the rubric can see it', async () => {
    await reportToNewsItem(input({ extractionQuality: 'partial' }));

    // A 0.4 on a partial extraction is not the same claim as a 0.4 on clean text.
    expect(ingestMock.mock.calls[0][0].rexMetadataExtra).toMatchObject({
      report_id: 'r1',
      extraction_quality: 'partial',
      page_count: 34,
    });
  });

  it('caps the body handed to the extractor but sends the full body to ingest', async () => {
    const body = 'x'.repeat(60_000);
    await reportToNewsItem(input({ body }));

    expect(extractMock.mock.calls[0][0].content.length).toBe(24_000);
    expect(ingestMock.mock.calls[0][0].body.length).toBe(60_000);
  });

  it('still ingests when metadata extraction fails, flagged rather than dropped', async () => {
    extractMock.mockResolvedValue({ data: null, reason: 'no_object_returned' });

    await reportToNewsItem(input());

    const arg = ingestMock.mock.calls[0][0];
    expect(arg.status).toBe('extraction_failed');
    expect(arg.category).toBe('international');
    expect(arg.rexMetadataExtra.metadata_extraction_failed).toBe('no_object_returned');
  });

  it('links the report and the news item in both directions', async () => {
    await reportToNewsItem(input());

    const reportUpdate = fakeSupabase.__buildersFor('reports')[0]!.update.mock.calls[0][0];
    const itemUpdate = fakeSupabase.__buildersFor('news_items')[0]!.update.mock.calls[0][0];
    expect(reportUpdate).toEqual({ news_item_id: 'n1' });
    expect(itemUpdate).toEqual({ report_id: 'r1' });
  });

  it('reports a duplicate without attempting to link anything', async () => {
    ingestMock.mockResolvedValue({ status: 'duplicate', reason: 'url' });

    const result = await reportToNewsItem(input());

    expect(result).toMatchObject({ newsItemId: null, status: 'duplicate', reason: 'url' });
    expect(fakeSupabase.__buildersFor('reports')).toHaveLength(0);
  });

  it('marks an HTML report as carrying no attachment', async () => {
    await reportToNewsItem(input({ fileFormat: 'html', pageCount: null }));
    expect(ingestMock.mock.calls[0][0]).toMatchObject({
      hasPdfAttachment: false,
      attachmentCount: 0,
    });
  });
});
