import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  companies: [] as Array<{ id: string; slug: string; legal_name: string }>,
  filters: [] as Array<[string, unknown, unknown]>,
  sendReviewQueueDigest: vi.fn(async () => ({ configured: true, attempted: 2, sent: 2, failed: 0 })),
}));

vi.mock('@platform/db', () => ({
  supabase: {
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      chain['select'] = vi.fn(() => chain);
      chain['neq'] = vi.fn((column: string, value: unknown) => {
        h.filters.push(['neq', column, value]);
        return chain;
      });
      chain['order'] = vi.fn(() => Promise.resolve({ data: h.companies, error: null }));
      return chain;
    }),
  },
}));
vi.mock('../../lib/sendReviewQueueDigest.js', () => ({
  sendReviewQueueDigest: h.sendReviewQueueDigest,
}));

import { runResearchIngestRoutine } from './run.js';

const routine = { id: 'r-1', title: 'Weekly corporate research ingest' };
const ran = (queuedRows: number) => ({
  runId: 'run-x',
  status: 'success',
  result: { queuedRows } as never,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.filters.length = 0;
  h.companies = [
    { id: 'c1', slug: 'strategy', legal_name: 'Strategy Inc' },
    { id: 'c2', slug: 'sequans', legal_name: 'Sequans' },
    { id: 'c3', slug: 'metaplanet', legal_name: 'Metaplanet Inc.' },
  ];
});

describe('runResearchIngestRoutine', () => {
  it('runs every record that is not retired, one at a time', async () => {
    const start = vi.fn(async (_companyId: string) => ran(0));

    await runResearchIngestRoutine(routine, start);

    expect(h.filters).toContainEqual(['neq', 'review_state', 'retired']);
    expect(start.mock.calls.map(([id]) => id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('emails the records left rows to review, and says so in the summary', async () => {
    const start = vi.fn(async (id: string) => ran(id === 'c1' ? 3 : id === 'c3' ? 1 : 0));

    const { summary, result } = await runResearchIngestRoutine(routine, start);

    expect(h.sendReviewQueueDigest).toHaveBeenCalledWith(routine, [
      { legalName: 'Strategy Inc', slug: 'strategy', queuedRows: 3 },
      { legalName: 'Metaplanet Inc.', slug: 'metaplanet', queuedRows: 1 },
    ]);
    expect(summary).toBe('4 rows waiting for review on 2 records: Strategy Inc, Metaplanet Inc.');
    expect(result).toMatchObject({ queued_rows: 4, emailed: true, link_url: '/research?view=review' });
  });

  it('names the records it drafted a subscriber summary for', async () => {
    const start = vi.fn(async (id: string) => ({
      runId: 'run-x',
      status: 'success',
      result: { queuedRows: 0, summaryDrafted: id !== 'c1' } as never,
    }));

    const { summary, result } = await runResearchIngestRoutine(routine, start);

    expect(result.summaries_drafted).toEqual(['sequans', 'metaplanet']);
    expect(summary).toContain('Subscriber summary drafted for 2 records: Sequans, Metaplanet Inc.');
    expect(summary).not.toContain('Inc..');
  });

  it('names a failed record and keeps going with the rest', async () => {
    const start = vi.fn(async (id: string) => {
      if (id === 'c2') throw new Error('SEC unreachable');
      return ran(id === 'c3' ? 2 : 0);
    });

    const { summary, result } = await runResearchIngestRoutine(routine, start);

    expect(start).toHaveBeenCalledTimes(3);
    expect(result.companies_failed).toEqual(['sequans']);
    expect(summary).toContain('1 record failed: sequans.');
  });

  it('treats a run that did not finish as failed rather than quiet', async () => {
    const start = vi.fn(async () => ({ runId: 'run-x', status: 'failed', result: null }));

    const { result } = await runResearchIngestRoutine(routine, start);

    expect(result.companies_failed).toEqual(['strategy', 'sequans', 'metaplanet']);
    expect(result.queued_rows).toBe(0);
  });

  it('says plainly when nothing happened', async () => {
    h.sendReviewQueueDigest.mockResolvedValueOnce(null as never);

    const { summary, result } = await runResearchIngestRoutine(routine, vi.fn(async () => ran(0)));

    expect(summary).toBe('Nothing to review: 3 records ingested, nothing new or changed.');
    expect(result.emailed).toBe(false);
  });
});
