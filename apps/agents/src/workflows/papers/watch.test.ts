import { describe, expect, it, vi } from 'vitest';

vi.mock('../../agents/researcher/index.js', () => ({ rex: { generate: vi.fn() } }));
vi.mock('../../config/model.js', () => ({ stepRequestContext: vi.fn() }));

const { runWatches, runPaperWatchRoutine, watchFilter } = await import('./watch.js');
import type { WatchDeps, WatchRow } from './watch.js';
import type { OpenAlexWork } from './openalex.js';
import type { ResolveResult } from './resolve.js';

const watch = (over: Partial<WatchRow> = {}): WatchRow => ({
  id: 'w1', name: 'Bitcoin in title or abstract', watch_type: 'openalex_query',
  config: { filter: 'title_and_abstract.search:bitcoin' }, high_water: null, hits_total: 0, promoted_total: 0, ...over,
});

const work = (n: number): OpenAlexWork => ({ id: `https://openalex.org/W${n}`, doi: `https://doi.org/10.1000/w${n}` });

function deps(pages: OpenAlexWork[][], over: Partial<WatchDeps> = {}) {
  const saved: Array<{ id: string; values: Record<string, unknown> }> = [];
  let call = 0;
  const d: WatchDeps = {
    loadWatches: vi.fn(async () => [watch()]),
    knownWorks: vi.fn(async () => new Set<string>(['W2'])),
    saveWatch: vi.fn(async (id, values) => { saved.push({ id, values }); }),
    listWorks: vi.fn(async () => {
      const results = pages[call] ?? [];
      call += 1;
      return { results, nextCursor: call < pages.length ? `c${call}` : null, count: null };
    }),
    resolve: vi.fn(async (): Promise<ResolveResult> => ({ status: 'committed', paperId: 'p', relevanceTier: 'core', peerReviewStatus: 'peer_reviewed', isDraft: false })),
    now: () => new Date('2026-10-19T20:00:00Z'),
    ...over,
  };
  return { d, saved };
}

describe('watchFilter', () => {
  it('builds an OpenAlex filter per watch type', () => {
    expect(watchFilter(watch(), null)).toBe('title_and_abstract.search:bitcoin');
    expect(watchFilter(watch({ watch_type: 'venue', config: { source_id: 'https://openalex.org/S123' } }), null)).toBe('primary_location.source.id:S123');
    expect(watchFilter(watch({ watch_type: 'author', config: { author_id: 'A9' } }), null)).toBe('authorships.author.id:A9');
    expect(watchFilter(watch({ watch_type: 'cites', config: { work_id: 'W7' } }), null)).toBe('cites:W7');
  });

  it('looks back 60 days past the high-water mark', () => {
    expect(watchFilter(watch(), '2026-10-18')).toBe('title_and_abstract.search:bitcoin,from_publication_date:2026-08-19');
  });

  it('has no runner yet for crossref_query or arxiv_category, or a watch missing its config', () => {
    expect(watchFilter(watch({ watch_type: 'crossref_query' }), null)).toBeNull();
    expect(watchFilter(watch({ watch_type: 'arxiv_category' }), null)).toBeNull();
    expect(watchFilter(watch({ watch_type: 'venue', config: {} }), null)).toBeNull();
  });
});

describe('runWatches', () => {
  it('pages through, skips works already held, resolves the rest and advances the mark', async () => {
    const { d, saved } = deps([[work(1), work(2)], [work(3)]]);
    const result = await runWatches({ maxResolve: 10 }, d);
    expect(d.resolve).toHaveBeenCalledTimes(2); // W2 is already in the register
    expect(d.resolve).toHaveBeenCalledWith({ work: work(1), discoveredVia: 'w1' });
    expect(result).toMatchObject({ watches_run: 1, works_seen: 3, new_works: 2, resolved: 2, promoted: 2, deferred: 0, failed: 0 });
    expect(saved).toEqual([{ id: 'w1', values: { last_run_at: '2026-10-19T20:00:00.000Z', hits_total: 2, promoted_total: 2, high_water: '2026-10-19' } }]);
  });

  it('stops at the budget, does not page further, and leaves the mark where it was', async () => {
    const { d, saved } = deps([[work(1), work(3), work(4)], [work(5)]]);
    const result = await runWatches({ maxResolve: 1 }, d);
    expect(d.resolve).toHaveBeenCalledTimes(1);
    expect(d.listWorks).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ resolved: 1, deferred: 2 });
    expect(saved[0].values).not.toHaveProperty('high_water');
  });

  it('counts a failed resolve, keeps going, and holds the mark', async () => {
    const resolve = vi.fn()
      .mockRejectedValueOnce(new Error('crossref 500'))
      .mockResolvedValue({ status: 'committed', paperId: 'p', relevanceTier: 'peripheral', peerReviewStatus: 'peer_reviewed', isDraft: false });
    const { d, saved } = deps([[work(1), work(3)]], { resolve });
    const result = await runWatches({ maxResolve: 10 }, d);
    expect(result).toMatchObject({ resolved: 1, failed: 1, promoted: 0 });
    expect(saved[0].values).not.toHaveProperty('high_water');
  });

  it('reads the full history for a backfill, and only the named watch', async () => {
    const { d } = deps([[work(1)]], {
      loadWatches: vi.fn(async () => [watch({ high_water: '2026-10-18' }), watch({ id: 'w2', name: 'Other' })]),
    });
    await runWatches({ maxResolve: 10, ignoreHighWater: true, watchId: 'w1' }, d);
    expect(d.listWorks).toHaveBeenCalledWith('title_and_abstract.search:bitcoin', '*');
  });

  it('re-resolves works already held when refreshing', async () => {
    const { d, saved } = deps([[work(1), work(2)]]);
    const result = await runWatches({ maxResolve: 10, refresh: true }, d);
    expect(d.resolve).toHaveBeenCalledTimes(2);
    // W2 was already held: re-resolved, but not counted as a new hit.
    expect(result).toMatchObject({ new_works: 1, resolved: 2 });
    expect(saved[0].values).toMatchObject({ hits_total: 1, promoted_total: 1 });
  });

  it('reports a watch type it cannot run', async () => {
    const { d } = deps([], { loadWatches: vi.fn(async () => [watch({ name: 'arXiv q-fin', watch_type: 'arxiv_category' })]) });
    expect(await runWatches({ maxResolve: 10 }, d)).toMatchObject({ watches_run: 0, skipped_watches: ['arXiv q-fin'] });
  });
});

describe('runPaperWatchRoutine', () => {
  it('summarises the run in one line', async () => {
    const { d } = deps([[work(1), work(3), work(4)]]);
    const { summary } = await runPaperWatchRoutine({ max_resolve_per_run: 2 }, d);
    expect(summary).toBe('3 new works across 1 watch; 2 resolved, 2 core or substantial; 1 deferred to the next run.');
  });
});
