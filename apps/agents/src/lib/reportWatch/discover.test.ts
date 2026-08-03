import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';

let fakeSupabase: FakeSupabaseClient;
vi.mock('@platform/db', () => ({
  get supabase() {
    return fakeSupabase;
  },
}));

const discoverMock = vi.fn();
vi.mock('./registry.js', () => ({
  adapterFor: (strategy: string) =>
    strategy === 'unimplemented' ? undefined : { strategy, discover: discoverMock },
  implementedStrategies: () => ['rss', 'sitemap', 'index_page'],
}));

const { evaluateCandidates, orderByRecency, discoverForSource, recordDiscoveryHealth } =
  await import('./discover.js');

const NOW = new Date('2026-08-03T00:00:00Z');

function source(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    name: 'River Financial',
    site_url: 'https://river.com',
    detection_strategies: ['index_page'],
    detection_config: { url_filters: { must_match: ['\\.pdf$', '/reports/'] } },
    max_candidates_per_run: 25,
    ...overrides,
  };
}

const found = (rawUrl: string, publishedAtHint: string | null = null) => ({
  rawUrl,
  titleHint: 'A report',
  publishedAtHint,
  landingUrl: null,
});

beforeEach(() => {
  fakeSupabase = createFakeSupabase();
  discoverMock.mockReset();
});

describe('evaluateCandidates', () => {
  it('normalises, dedupes within the batch, and flags filter misses', () => {
    const out = evaluateCandidates(
      [
        found('https://river.com/reports/a?utm_source=x'),
        found('https://river.com/reports/a'),   // same URL post-normalisation
        found('https://river.com/blog/b'),      // fails must_match
        found('mailto:hi@river.com'),           // no identity — dropped entirely
      ],
      'index_page',
      { url_filters: { must_match: ['/reports/'] } },
      'https://river.com',
    );

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ url: 'https://river.com/reports/a', skipReason: null });
    // Rejections are RETAINED, not dropped: without a memory of them the same
    // few hundred non-reports are re-evaluated on every run, forever.
    expect(out[1]).toMatchObject({ url: 'https://river.com/blog/b', skipReason: 'filter_mismatch' });
  });
});

describe('orderByRecency', () => {
  it('puts newest first and undated last', () => {
    const ordered = orderByRecency(
      evaluateCandidates(
        [
          found('https://x.test/a', '2026-01-01'),
          found('https://x.test/b', null),
          found('https://x.test/c', '2026-07-01'),
        ],
        'sitemap',
        {},
        null,
      ),
    );
    expect(ordered.map((c) => c.url)).toEqual([
      'https://x.test/c',
      'https://x.test/a',
      'https://x.test/b',
    ]);
  });
});

describe('discoverForSource', () => {
  it('stops at the first strategy that returns candidates', async () => {
    discoverMock
      .mockResolvedValueOnce({ ok: false, error: { kind: 'transport', message: 'feed down' } })
      .mockResolvedValueOnce({ ok: true, candidates: [found('https://river.com/reports/a.pdf')] });

    const outcome = await discoverForSource(
      source({ detection_strategies: ['rss', 'index_page'] }),
      NOW,
    );

    expect(discoverMock).toHaveBeenCalledTimes(2);
    expect(outcome.strategyUsed).toBe('index_page');
    expect(outcome.queued).toHaveLength(1);
    expect(outcome.error).toBeNull();
  });

  it('reports an error only when every strategy failed', async () => {
    discoverMock.mockResolvedValue({ ok: false, error: { kind: 'parse', message: 'selector matched nothing' } });

    const outcome = await discoverForSource(
      source({ detection_strategies: ['rss', 'index_page'] }),
      NOW,
    );

    expect(outcome.strategyUsed).toBeNull();
    expect(outcome.error).toContain('selector matched nothing');
    expect(outcome.queued).toEqual([]);
  });

  it('caps the queue at max_candidates_per_run, newest first', async () => {
    // A first run against a large sitemap works through its backlog over
    // several days by design — the newest reports go first.
    discoverMock.mockResolvedValue({
      ok: true,
      candidates: [
        found('https://river.com/reports/old.pdf', '2020-01-01'),
        found('https://river.com/reports/new.pdf', '2026-07-01'),
        found('https://river.com/reports/mid.pdf', '2024-01-01'),
      ],
    });

    const outcome = await discoverForSource(source({ max_candidates_per_run: 2 }), NOW);

    expect(outcome.found).toBe(3);
    expect(outcome.queued.map((c) => c.url)).toEqual([
      'https://river.com/reports/new.pdf',
      'https://river.com/reports/mid.pdf',
    ]);
  });

  it('counts only rows it had not seen before as new', async () => {
    fakeSupabase.__setResponse('report_candidates', {
      data: [{ url_hash: (await import('./normalize.js')).urlHash('https://river.com/reports/a.pdf') }],
      error: null,
    });
    discoverMock.mockResolvedValue({
      ok: true,
      candidates: [found('https://river.com/reports/a.pdf'), found('https://river.com/reports/b.pdf')],
    });

    const outcome = await discoverForSource(source(), NOW);

    expect(outcome.newCandidates).toBe(1);
    const upserts = fakeSupabase.__buildersFor('report_candidates').filter((b) => b.upsert.mock.calls.length);
    expect(upserts).toHaveLength(1);
    // Re-seeing a URL must not resurrect an already-acquired candidate, so the
    // known row's payload carries no `status`.
    const rows = upserts[0].upsert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows[0]).not.toHaveProperty('status');
    expect(rows[1]).toMatchObject({ status: 'new', skip_reason: null });
  });

  it('errors when no strategies are configured', async () => {
    const outcome = await discoverForSource(source({ detection_strategies: [] }), NOW);
    expect(outcome.error).toContain('no detection strategies');
    expect(discoverMock).not.toHaveBeenCalled();
  });
});

describe('recordDiscoveryHealth', () => {
  const outcome = (over: Record<string, unknown>) => ({
    sourceId: 's1',
    sourceName: 'River',
    strategyUsed: 'index_page',
    found: 0,
    newCandidates: 0,
    queued: [],
    error: null,
    ...over,
  });

  const lastUpdate = () => {
    const builders = fakeSupabase.__buildersFor('news_sources').filter((b) => b.update.mock.calls.length);
    return builders[builders.length - 1]!.update.mock.calls[0][0] as Record<string, unknown>;
  };

  it('resets the empty counter when candidates were found', async () => {
    await recordDiscoveryHealth(outcome({ found: 4 }), NOW);
    expect(lastUpdate()).toMatchObject({
      last_status: 'success',
      detection_consecutive_empty: 0,
      detection_last_success_at: NOW.toISOString(),
    });
  });

  it('increments the empty counter on a clean run that found nothing', async () => {
    fakeSupabase.__setResponse('news_sources', { data: { detection_consecutive_empty: 4 }, error: null });
    await recordDiscoveryHealth(outcome({ found: 0 }), NOW);
    expect(lastUpdate()).toMatchObject({ last_status: 'success', detection_consecutive_empty: 5 });
  });

  it('leaves the empty counter untouched when the run errored', async () => {
    // A broken selector and a quiet publisher must not look the same in the one
    // view built to tell them apart.
    await recordDiscoveryHealth(outcome({ error: 'selector matched nothing' }), NOW);
    const update = lastUpdate();
    expect(update).toMatchObject({ last_status: 'failed' });
    expect(update).not.toHaveProperty('detection_consecutive_empty');
  });
});
