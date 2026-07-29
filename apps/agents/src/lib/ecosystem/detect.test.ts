import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';

let fakeSupabase: FakeSupabaseClient;
vi.mock('@platform/db', () => ({
  get supabase() {
    return fakeSupabase;
  },
}));

const detectMock = vi.fn();
vi.mock('./registry.js', () => ({
  adapterFor: (watchType: string) =>
    watchType === 'unimplemented' ? undefined : { watchType, detect: detectMock },
  implementedWatchTypes: () => ['github_release'],
}));

const { runDetection, isDue, healthFor } = await import('./detect.js');

const NOW = new Date('2026-07-29T12:00:00Z');

function watchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'w1',
    product_service_id: 'p1',
    advisor_partner_id: null,
    watch_type: 'github_release',
    label: 'Coldcard firmware',
    config: { owner: 'Coldcard', repo: 'firmware' },
    check_frequency: 'daily',
    last_checked_at: '2026-07-27T12:00:00Z',
    last_state: { latest_tag: 'v6.3.3' },
    consecutive_failures: 0,
    products_services: { name: 'Coldcard' },
    advisors_partners: null,
    ...overrides,
  };
}

const oneChange = {
  ok: true,
  changes: [
    {
      changeType: 'release',
      title: 'firmware v6.3.4',
      payload: { new_version: 'v6.3.4' },
      dedupKey: 'release:1',
      occurredAt: '2026-07-12T02:00:00Z',
      externalUrl: 'https://example.invalid/r',
    },
  ],
  nextState: { latest_tag: 'v6.3.4' },
};

beforeEach(() => {
  fakeSupabase = createFakeSupabase();
  detectMock.mockReset();
});

describe('isDue', () => {
  it('treats a never-checked watch as due', () => {
    expect(isDue(watchRow({ last_checked_at: null }), NOW)).toBe(true);
  });

  it('waits out the interval for its cadence', () => {
    const twoHoursAgo = new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString();
    expect(isDue(watchRow({ check_frequency: 'hourly', last_checked_at: twoHoursAgo }), NOW)).toBe(true);
    expect(isDue(watchRow({ check_frequency: 'daily', last_checked_at: twoHoursAgo }), NOW)).toBe(false);
  });

  // realtime watches ride the email spine; polling them would double-ingest.
  it('never polls a realtime watch', () => {
    expect(isDue(watchRow({ check_frequency: 'realtime', last_checked_at: null }), NOW)).toBe(false);
  });

  it('backs off a failing watch instead of hammering the vendor', () => {
    const oneDayAgo = new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString();
    expect(isDue(watchRow({ last_checked_at: oneDayAgo, consecutive_failures: 0 }), NOW)).toBe(true);
    // Two failures = wait 4x the interval, so a day later it is not yet due.
    expect(isDue(watchRow({ last_checked_at: oneDayAgo, consecutive_failures: 2 }), NOW)).toBe(false);
  });

  it('caps the backoff so a recovered vendor is retried', () => {
    const twentyDaysAgo = new Date(NOW.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString();
    expect(isDue(watchRow({ last_checked_at: twentyDaysAgo, consecutive_failures: 99 }), NOW)).toBe(true);
  });
});

describe('healthFor', () => {
  it('bands failures into healthy, degraded and failing', () => {
    expect(healthFor(0)).toBe('healthy');
    expect(healthFor(2)).toBe('healthy');
    expect(healthFor(3)).toBe('degraded');
    expect(healthFor(6)).toBe('failing');
  });
});

describe('runDetection', () => {
  it('persists a detected change with the register name and the deterministic fields only', async () => {
    fakeSupabase.__setResponses('ecosystem_watches', [
      { data: [watchRow()], error: null },
      { data: [{ id: 'w1' }], error: null }, // claim won
      { data: null, error: null }, // outcome
    ]);
    fakeSupabase.__setResponse('ecosystem_changes', { data: [{ id: 'ch1' }], error: null });
    detectMock.mockResolvedValue(oneChange);

    const summary = await runDetection(NOW);

    expect(summary).toMatchObject({ watchesChecked: 1, changesDetected: 1, failures: [] });
    const insert = fakeSupabase.__buildersFor('ecosystem_changes')[0].insert;
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({
        watch_id: 'w1',
        product_service_id: 'p1',
        entity_name: 'Coldcard',
        change_type: 'release',
        dedup_key: 'release:1',
      }),
    ]);
    // Enrichment fields must be absent, not guessed at.
    const [[inserted]] = insert.mock.calls as [[Record<string, unknown>[]]];
    expect(inserted[0]).not.toHaveProperty('summary');
    expect(inserted[0]).not.toHaveProperty('materiality');
    expect(inserted[0]).not.toHaveProperty('compliance_class');
  });

  it('skips a watch when a concurrent tick already claimed it', async () => {
    fakeSupabase.__setResponses('ecosystem_watches', [
      { data: [watchRow()], error: null },
      { data: [], error: null }, // claim lost
    ]);
    detectMock.mockResolvedValue(oneChange);

    const summary = await runDetection(NOW);

    expect(summary).toMatchObject({ watchesChecked: 0, watchesSkipped: 1, changesDetected: 0 });
    expect(detectMock).not.toHaveBeenCalled();
    expect(fakeSupabase.__buildersFor('ecosystem_changes')).toHaveLength(0);
  });

  it('advances the anchor and records last_change_at when something fired', async () => {
    fakeSupabase.__setResponses('ecosystem_watches', [
      { data: [watchRow()], error: null },
      { data: [{ id: 'w1' }], error: null },
      { data: null, error: null },
    ]);
    fakeSupabase.__setResponse('ecosystem_changes', { data: [{ id: 'ch1' }], error: null });
    detectMock.mockResolvedValue(oneChange);

    await runDetection(NOW);

    const outcome = fakeSupabase.__buildersFor('ecosystem_watches')[2].update;
    expect(outcome).toHaveBeenCalledWith(
      expect.objectContaining({
        last_state: { latest_tag: 'v6.3.4' },
        consecutive_failures: 0,
        health: 'healthy',
        last_change_at: NOW.toISOString(),
      }),
    );
  });

  it('does not stamp last_change_at on a clean run that found nothing', async () => {
    fakeSupabase.__setResponses('ecosystem_watches', [
      { data: [watchRow()], error: null },
      { data: [{ id: 'w1' }], error: null },
      { data: null, error: null },
    ]);
    detectMock.mockResolvedValue({ ok: true, changes: [], nextState: { latest_tag: 'v6.3.3' } });

    await runDetection(NOW);

    const outcome = fakeSupabase.__buildersFor('ecosystem_watches')[1].update;
    expect(outcome.mock.calls[0][0]).not.toHaveProperty('last_change_at');
  });

  it('degrades a failing watch and leaves its anchor untouched', async () => {
    fakeSupabase.__setResponses('ecosystem_watches', [
      // Two prior failures back this watch off to 4x its daily interval, so it
      // needs a last check older than that to be due at all.
      {
        data: [watchRow({ consecutive_failures: 2, last_checked_at: '2026-07-24T12:00:00Z' })],
        error: null,
      },
      { data: [{ id: 'w1' }], error: null },
      { data: null, error: null },
    ]);
    detectMock.mockResolvedValue({
      ok: false,
      error: { kind: 'not_found', message: 'HTTP 404' },
    });

    const summary = await runDetection(NOW);

    expect(summary.failures).toEqual([
      { watchId: 'w1', label: 'Coldcard firmware', kind: 'not_found', message: 'HTTP 404' },
    ]);
    const outcome = fakeSupabase.__buildersFor('ecosystem_watches')[2].update;
    expect(outcome).toHaveBeenCalledWith({ consecutive_failures: 3, health: 'degraded' });
    // A failed read must not move the diff anchor — the next run has to
    // re-compare against the last state we actually trusted.
    expect(outcome.mock.calls[0][0]).not.toHaveProperty('last_state');
  });

  // The adapter contract says never throw. This is what happens when one does.
  it('contains an adapter that throws rather than sinking the sweep', async () => {
    fakeSupabase.__setResponses('ecosystem_watches', [
      { data: [watchRow()], error: null },
      { data: [{ id: 'w1' }], error: null },
      { data: null, error: null },
    ]);
    detectMock.mockRejectedValue(new Error('socket hang up'));

    const summary = await runDetection(NOW);

    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0]).toMatchObject({ kind: 'transport', message: 'socket hang up' });
  });

  it('treats a duplicate insert as already-recorded, not as a failure', async () => {
    fakeSupabase.__setResponses('ecosystem_watches', [
      { data: [watchRow()], error: null },
      { data: [{ id: 'w1' }], error: null },
      { data: null, error: null },
    ]);
    fakeSupabase.__setResponse('ecosystem_changes', {
      data: null,
      error: { message: 'duplicate key value violates unique constraint', code: '23505' } as never,
    });
    detectMock.mockResolvedValue(oneChange);

    const summary = await runDetection(NOW);

    expect(summary.changesDetected).toBe(0);
    expect(summary.failures).toEqual([]);
  });

  it('skips a watch type with no adapter without counting it against health', async () => {
    fakeSupabase.__setResponses('ecosystem_watches', [
      { data: [watchRow({ watch_type: 'unimplemented' })], error: null },
    ]);

    const summary = await runDetection(NOW);

    expect(summary).toMatchObject({ watchesChecked: 0, watchesSkipped: 1, failures: [] });
    expect(fakeSupabase.__buildersFor('ecosystem_watches')).toHaveLength(1);
  });

  it('falls back to the advisor name for an advisor-owned watch', async () => {
    fakeSupabase.__setResponses('ecosystem_watches', [
      {
        data: [
          watchRow({
            product_service_id: null,
            advisor_partner_id: 'a1',
            products_services: null,
            advisors_partners: { name: 'Acme Legal' },
          }),
        ],
        error: null,
      },
      { data: [{ id: 'w1' }], error: null },
      { data: null, error: null },
    ]);
    fakeSupabase.__setResponse('ecosystem_changes', { data: [{ id: 'ch1' }], error: null });
    detectMock.mockResolvedValue(oneChange);

    await runDetection(NOW);

    expect(fakeSupabase.__buildersFor('ecosystem_changes')[0].insert).toHaveBeenCalledWith([
      expect.objectContaining({ entity_name: 'Acme Legal', advisor_partner_id: 'a1' }),
    ]);
  });
});
