import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';

let fakeSupabase: FakeSupabaseClient;
vi.mock('@platform/db', () => ({
  get supabase() {
    return fakeSupabase;
  },
}));

const embedTextsMock = vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2]));
vi.mock('../contentEmbeddings.js', () => ({
  embedTexts: (texts: string[]) => embedTextsMock(texts),
}));

const { persistReport, resolveTitle, resolvePublishedAt, classifyReportType } =
  await import('./persistReport.js');

const extraction = (over: Record<string, unknown> = {}) => ({
  pages: ['Bitcoin adoption broadened through the quarter, with institutional flows rising.'],
  body: 'Bitcoin adoption broadened through the quarter, with institutional flows rising.',
  pageCount: 1,
  wordCount: 11,
  method: 'pdf_text_layer' as const,
  quality: 'good' as const,
  metrics: { chars_per_page: 78, alpha_ratio: 0.9, empty_page_count: 0, ocr_pages: 0, page_count: 1 },
  ocrUsed: false,
  titleHint: null as string | null,
  publishedAtHint: null as string | null,
  error: null as string | null,
  ...over,
});

const input = (over: Record<string, unknown> = {}) => ({
  sourceId: 's1',
  sourceName: 'River Financial',
  candidateId: 'c1',
  sourceUrl: 'https://river.com/files/adoption-2026.pdf',
  canonicalUrl: null,
  contentHash: 'hash-new',
  storagePath: 'river-financial/2026/hash-new.pdf',
  fileName: 'adoption-2026.pdf',
  fileSizeBytes: 1024,
  fileFormat: 'pdf' as const,
  titleHint: null as string | null,
  publishedAtHint: null as string | null,
  httpLastModified: null as string | null,
  redistribution: 'internal_only' as const,
  licenceNotes: null,
  extraction: extraction(),
  ...over,
});

beforeEach(() => {
  fakeSupabase = createFakeSupabase();
  embedTextsMock.mockClear();
});

describe('resolveTitle', () => {
  it('prefers PDF metadata, then the first heading, then the scraped hint, then the filename', () => {
    expect(resolveTitle(input({ extraction: extraction({ titleHint: 'From PDF' }) }))).toBe('From PDF');
    expect(
      resolveTitle(input({ extraction: extraction({ body: '# From heading\n\ntext' }), titleHint: 'Scraped' })),
    ).toBe('From heading');
    expect(resolveTitle(input({ titleHint: 'Scraped' }))).toBe('Scraped');
    expect(resolveTitle(input())).toBe('adoption 2026');
  });
});

describe('resolvePublishedAt', () => {
  it('records which rung of the waterfall won', () => {
    expect(resolvePublishedAt(input({ extraction: extraction({ publishedAtHint: '2026-07-01' }) }))).toEqual({
      publishedAt: '2026-07-01',
      source: 'pdf_metadata',
    });
    expect(resolvePublishedAt(input({ publishedAtHint: '2026-06-01' }))).toEqual({
      publishedAt: '2026-06-01',
      source: 'scraped',
    });
    expect(resolvePublishedAt(input({ httpLastModified: 'Tue, 01 Jul 2026 09:00:00 GMT' }))).toEqual({
      publishedAt: '2026-07-01',
      source: 'http_last_modified',
    });
    expect(resolvePublishedAt(input())).toEqual({ publishedAt: null, source: null });
  });
});

describe('classifyReportType', () => {
  it('reads the filing label off the title', () => {
    expect(classifyReportType('Q2 2026 Institutional Flows')).toBe('quarterly');
    expect(classifyReportType('FY2026 Annual Review')).toBe('annual');
    expect(classifyReportType('A Bitcoin Primer')).toBe('whitepaper');
    expect(classifyReportType('ASIC Consultation Paper 401')).toBe('regulatory');
    expect(classifyReportType('Week On-chain 29')).toBe('market_update');
    expect(classifyReportType('Research note: mining margins')).toBe('research_note');
    expect(classifyReportType('Something else entirely')).toBe('other');
  });
});

describe('persistReport', () => {
  it('writes the report and its segments on a good extraction', async () => {
    fakeSupabase.__setResponses('reports', [
      { data: [], error: null },                 // predecessor lookup
      { data: { id: 'r1' }, error: null },       // insert
    ]);

    const result = await persistReport(input());

    expect(result).toMatchObject({ reportId: 'r1', revisionOf: null, error: null });
    expect(result.segments).toBeGreaterThan(0);
    const row = fakeSupabase.__buildersFor('reports')[1]!.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({ status: 'ingested', extraction_quality: 'good' });
  });

  it('holds the publish wall on a failed extraction', async () => {
    fakeSupabase.__setResponses('reports', [
      { data: [], error: null },
      { data: { id: 'r1' }, error: null },
    ]);

    const result = await persistReport(input({ extraction: extraction({ quality: 'failed' }) }));

    // The artefact and the row still exist — a report BTS knows about but
    // cannot read beats one it never noticed. The vectors do not, because
    // garbage retrieves and then gets quoted.
    expect(result.reportId).toBe('r1');
    expect(result.segments).toBe(0);
    expect(embedTextsMock).not.toHaveBeenCalled();
    const row = fakeSupabase.__buildersFor('reports')[1]!.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.status).toBe('needs_review');
  });

  it('still embeds a partial extraction', async () => {
    fakeSupabase.__setResponses('reports', [
      { data: [], error: null },
      { data: { id: 'r1' }, error: null },
    ]);

    const result = await persistReport(input({ extraction: extraction({ quality: 'partial' }) }));
    expect(result.segments).toBeGreaterThan(0);
  });

  it('links a revision to its predecessor and stamps superseded_at', async () => {
    fakeSupabase.__setResponses('reports', [
      { data: [{ id: 'r-old', content_hash: 'hash-old' }], error: null },
      { data: { id: 'r-new' }, error: null },
      { data: null, error: null },   // supersede update
    ]);

    const result = await persistReport(input());

    expect(result.revisionOf).toBe('r-old');
    const row = fakeSupabase.__buildersFor('reports')[1]!.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.revision_of_report_id).toBe('r-old');
    // Both rows are kept. Deleting the version BTS actually read would defeat
    // the point of storing it.
    const supersede = fakeSupabase.__buildersFor('reports')[2]!.update.mock.calls[0][0] as Record<string, unknown>;
    expect(supersede).toHaveProperty('superseded_at');
  });

  it('does not treat a byte-identical re-acquisition of the same URL as a revision', async () => {
    fakeSupabase.__setResponses('reports', [
      { data: [{ id: 'r-old', content_hash: 'hash-new' }], error: null },
      { data: { id: 'r-new' }, error: null },
    ]);

    const result = await persistReport(input());
    expect(result.revisionOf).toBeNull();
  });

  it('reports an insert failure without throwing', async () => {
    fakeSupabase.__setResponses('reports', [
      { data: [], error: null },
      { data: null, error: { message: 'duplicate key value violates unique constraint' } },
    ]);

    const result = await persistReport(input());
    expect(result.reportId).toBeNull();
    expect(result.error).toContain('duplicate key');
  });
});
