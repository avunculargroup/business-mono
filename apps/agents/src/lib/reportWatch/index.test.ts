import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';

let fakeSupabase: FakeSupabaseClient;
vi.mock('@platform/db', () => ({
  get supabase() {
    return fakeSupabase;
  },
}));

const discoverMock = vi.fn();
const recordHealthMock = vi.fn(async () => undefined);
vi.mock('./discover.js', () => ({
  discoverForSource: (...args: unknown[]) => discoverMock(...args),
  recordDiscoveryHealth: (...args: unknown[]) => recordHealthMock(...(args as [])),
}));

const acquireMock = vi.fn();
vi.mock('./acquire.js', () => ({
  acquireCandidate: (...args: unknown[]) => acquireMock(...args),
}));

const extractMock = vi.fn();
vi.mock('./extract/index.js', () => ({
  extractReport: (...args: unknown[]) => extractMock(...args),
}));

const persistMock = vi.fn();
vi.mock('./persistReport.js', () => ({
  persistReport: (...args: unknown[]) => persistMock(...args),
}));

const feedMock = vi.fn();
vi.mock('./toNewsItem.js', () => ({
  reportToNewsItem: (...args: unknown[]) => feedMock(...args),
}));

const markAcquiredMock = vi.fn(async () => undefined);
const markDuplicateMock = vi.fn(async () => undefined);
const markSkippedMock = vi.fn(async () => undefined);
const markAttemptFailedMock = vi.fn(async () => 'new' as const);
vi.mock('./candidateStatus.js', () => ({
  markAcquired: (...a: unknown[]) => markAcquiredMock(...(a as [])),
  markDuplicate: (...a: unknown[]) => markDuplicateMock(...(a as [])),
  markSkipped: (...a: unknown[]) => markSkippedMock(...(a as [])),
  markAttemptFailed: (...a: unknown[]) => markAttemptFailedMock(...(a as [])),
  recordHead: async () => undefined,
}));

const { runReportWatchScan } = await import('./index.js');

const NOW = new Date('2026-08-03T00:00:00Z');

const sourceRow = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  name: 'River Financial',
  site_url: 'https://river.com',
  tier: 'tier_1',
  detection_strategies: ['index_page'],
  detection_config: {},
  crawl_delay_seconds: 0,
  ocr_enabled: false,
  ocr_page_limit: 40,
  max_candidates_per_run: 25,
  redistribution_default: 'internal_only',
  licence_notes: null,
  ...over,
});

const queued = (urlHash = 'h1') => ({
  url: 'https://river.com/files/a.pdf',
  urlHash,
  rawUrl: 'https://river.com/files/a.pdf',
  discoveryMethod: 'index_page',
  titleHint: 'A report',
  publishedAtHint: '2026-07-01',
  landingUrl: null,
  skipReason: null,
});

const discovery = (over: Record<string, unknown> = {}) => ({
  sourceId: 's1',
  sourceName: 'River Financial',
  strategyUsed: 'index_page',
  found: 1,
  newCandidates: 1,
  queued: [queued()],
  error: null,
  ...over,
});

const acquired = {
  outcome: 'acquired' as const,
  artefact: {
    url: 'https://river.com/files/a.pdf',
    canonicalUrl: null,
    bytes: new Uint8Array([1]),
    contentHash: 'hash-a',
    fileFormat: 'pdf' as const,
    fileName: 'a.pdf',
    fileSizeBytes: 1,
    storagePath: 'river-financial/2026/hash-a.pdf',
    lastModified: null,
  },
  head: { status: 200, contentType: 'application/pdf' },
};

const extraction = {
  pages: ['text'],
  body: 'text',
  pageCount: 1,
  wordCount: 1,
  method: 'pdf_text_layer' as const,
  quality: 'good' as const,
  metrics: { chars_per_page: 4, alpha_ratio: 1, empty_page_count: 0, ocr_pages: 0, page_count: 1 },
  ocrUsed: false,
  titleHint: null,
  publishedAtHint: null,
  error: null,
};

/** Candidate row lookups come back as 'new' unless a test says otherwise. */
function withCandidate(status = 'new', attempts = 0) {
  fakeSupabase.__setResponse('report_candidates', {
    data: { id: 'c1', attempts, status },
    error: null,
  });
}

beforeEach(() => {
  fakeSupabase = createFakeSupabase();
  for (const m of [discoverMock, acquireMock, extractMock, persistMock, feedMock,
    markAcquiredMock, markDuplicateMock, markSkippedMock, markAttemptFailedMock, recordHealthMock]) {
    m.mockClear();
  }
  fakeSupabase.__setResponse('news_sources', { data: [sourceRow()], error: null });
  withCandidate();
  discoverMock.mockResolvedValue(discovery());
  acquireMock.mockResolvedValue(acquired);
  extractMock.mockResolvedValue(extraction);
  persistMock.mockResolvedValue({
    reportId: 'r1', segments: 3, revisionOf: null, title: 'A report', publishedAt: '2026-07-01', error: null,
  });
  feedMock.mockResolvedValue({ newsItemId: 'n1', relevanceScore: 0.8, status: 'inserted' });
});

describe('runReportWatchScan', () => {
  it('runs discover → acquire → extract → persist → feed for a queued candidate', async () => {
    const result = await runReportWatchScan({}, 'rt1', NOW);

    expect(result).toMatchObject({
      sources_scanned: 1,
      candidates_found: 1,
      candidates_new: 1,
      reports_acquired: 1,
      segments_embedded: 3,
      news_items_created: 1,
      failed_sources: [],
      empty_sources: [],
    });
    expect(markAcquiredMock).toHaveBeenCalledWith('c1', 'r1');
    // The title and date the persist waterfalls resolved are handed to the feed
    // rather than re-derived, so the two rows agree.
    expect(feedMock.mock.calls[0][0]).toMatchObject({
      title: 'A report',
      publishedAt: '2026-07-01',
      routineId: 'rt1',
    });
  });

  it('records discovery health for every source, failed or not', async () => {
    discoverMock.mockResolvedValue(discovery({ error: 'selector matched nothing', queued: [], found: 0 }));

    const result = await runReportWatchScan({}, null, NOW);

    expect(recordHealthMock).toHaveBeenCalledOnce();
    expect(result.failed_sources).toEqual(['River Financial']);
    // A discovery failure does not attempt acquisition.
    expect(acquireMock).not.toHaveBeenCalled();
  });

  it('names sources that returned nothing — the silent-failure signal', async () => {
    discoverMock.mockResolvedValue(discovery({ found: 0, newCandidates: 0, queued: [] }));

    const result = await runReportWatchScan({}, null, NOW);
    expect(result.empty_sources).toEqual(['River Financial']);
  });

  it('honours the per-run acquisition budget', async () => {
    discoverMock.mockResolvedValue(
      discovery({ found: 3, queued: [queued('h1'), queued('h2'), queued('h3')] }),
    );

    await runReportWatchScan({ max_acquisitions_per_run: 2 }, null, NOW);
    expect(acquireMock).toHaveBeenCalledTimes(2);
  });

  it('skips candidates whose status is already terminal', async () => {
    // 'acquired', 'skipped' and 'duplicate' are terminal; 'failed' has spent
    // its retry budget. Re-working any of them would re-download the artefact.
    withCandidate('acquired');

    const result = await runReportWatchScan({}, null, NOW);

    expect(acquireMock).not.toHaveBeenCalled();
    expect(result.reports_acquired).toBe(0);
  });

  it('counts a duplicate without extracting or embedding', async () => {
    acquireMock.mockResolvedValue({
      outcome: 'duplicate', reportId: 'r-existing', contentHash: 'hash-a', head: {},
    });

    const result = await runReportWatchScan({}, null, NOW);

    expect(result.reports_duplicate).toBe(1);
    expect(extractMock).not.toHaveBeenCalled();
    expect(markDuplicateMock).toHaveBeenCalledWith('c1', 'r-existing');
  });

  it('records a skip with its reason and moves on', async () => {
    acquireMock.mockResolvedValue({ outcome: 'skipped', reason: 'too_large', head: {} });

    const result = await runReportWatchScan({}, null, NOW);

    expect(markSkippedMock).toHaveBeenCalledWith('c1', 'too_large');
    expect(result.reports_acquired).toBe(0);
    expect(result.reports_failed).toBe(0);
  });

  it('spends a retry attempt on a transport failure', async () => {
    acquireMock.mockResolvedValue({ outcome: 'failed', message: 'HTTP 503', head: {} });

    const result = await runReportWatchScan({}, null, NOW);

    expect(markAttemptFailedMock).toHaveBeenCalledWith('c1', 0, 'HTTP 503');
    expect(result.reports_failed).toBe(1);
  });

  it('treats a persist failure as a retryable attempt, not an acquisition', async () => {
    persistMock.mockResolvedValue({
      reportId: null, segments: 0, revisionOf: null, title: 'A report', publishedAt: null,
      error: 'unique violation',
    });

    const result = await runReportWatchScan({}, null, NOW);

    expect(result.reports_acquired).toBe(0);
    expect(result.reports_failed).toBe(1);
    expect(feedMock).not.toHaveBeenCalled();
  });

  it('returns an empty result rather than throwing when the source load fails', async () => {
    fakeSupabase.__setResponse('news_sources', { data: null, error: { message: 'boom' } });

    const result = await runReportWatchScan({}, null, NOW);
    expect(result.sources_scanned).toBe(0);
  });

  it('logs the run to agent_activity under rex', async () => {
    await runReportWatchScan({}, null, NOW);

    const activity = fakeSupabase.__buildersFor('agent_activity');
    expect(activity).toHaveLength(1);
    // 'rex' rather than a new roster name: the CHECK admits only the personas,
    // and widening three constraints for a log label is not worth it.
    expect(activity[0].insert.mock.calls[0][0]).toMatchObject({
      agent_name: 'rex',
      action: 'Report watch scan',
      status: 'auto',
    });
  });
});
