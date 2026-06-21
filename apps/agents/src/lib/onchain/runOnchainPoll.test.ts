import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';
import type { AdapterResult, OnchainAdapter, RawObservation } from './types.js';

const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
let adapterResult: AdapterResult;
const fetchLatest = vi.fn(async (): Promise<AdapterResult> => adapterResult);
const adapter: OnchainAdapter = { provider: 'mempool', fetchLatest };

vi.mock('@platform/db', () => ({ get supabase() { return fakeSupabase; } }));
vi.mock('./registry.js', () => ({ getAdapter: () => adapter }));

const { runOnchainPoll } = await import('./runOnchainPoll.js');

const NOW = new Date('2026-06-20T00:00:00Z');
const ROUTINE = {
  id: 'r1',
  name: 'Daily on-chain indicator poll',
  action_type: 'onchain_poll',
  action_config: { backfill_days: 90 },
  frequency: 'daily',
  time_of_day: '08:00',
  timezone: 'Australia/Melbourne',
};

function hashRate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'i-hr',
    key: 'hash_rate',
    name: 'Network Hash Rate (7d)',
    short_label: 'Hash Rate',
    metric_group: 'network_security',
    derivation: 'fetched',
    provider: 'mempool',
    provider_metric_code: 'hashrate.currentHashrate',
    unit: 'eh_s',
    decimals: 1,
    alert_config: {}, // empty → no alert noise in supersession tests
    ...overrides,
  };
}

function obs(observedAt: string, value: number, key = 'hash_rate'): RawObservation {
  return { observedAt, key, value, raw: { observedAt, value } };
}

function setIndicators(rows: unknown[]) {
  fakeSupabase.__setResponse('onchain_indicators', { data: rows, error: null });
}
function setObservations(rows: unknown[]) {
  fakeSupabase.__setResponse('onchain_observations', { data: rows, error: null });
}
function setHashRibbons(rows: unknown[]) {
  fakeSupabase.__setResponse('v_hash_ribbons', { data: rows, error: null });
}
function setRecentBeat(present: boolean) {
  fakeSupabase.__setResponse('agent_activity', { data: present ? { id: 'a1' } : null, error: null });
}
function obsInsertCount() {
  return fakeSupabase.__buildersFor('onchain_observations').reduce((n, b) => n + b.insert.mock.calls.length, 0);
}
function beatInserts() {
  return fakeSupabase
    .__buildersFor('agent_activity')
    .flatMap((b) => b.insert.mock.calls.map((c) => c[0] as Record<string, unknown>));
}

beforeEach(() => {
  fakeSupabase.__builders.length = 0;
  fakeSupabase.__responses.clear();
  fetchLatest.mockClear();
  setRecentBeat(false);
});

describe('runOnchainPoll — supersession', () => {
  it('first ingest: backfills (adapter called with backfillDays), inserts all, proposes no beat', async () => {
    setIndicators([hashRate()]);
    setObservations([]); // nothing yet → first ingest
    adapterResult = { ok: true, observations: [obs('2026-06-18', 640), obs('2026-06-19', 641), obs('2026-06-20', 642)] };

    const out = await runOnchainPoll(ROUTINE, NOW);

    expect(out.status).toBe('success');
    expect(out.onchain_poll_result).toMatchObject({ indicators_polled: 1, observations_inserted: 3, no_op: 0 });
    expect(obsInsertCount()).toBe(3);
    expect(fetchLatest).toHaveBeenCalledWith(expect.anything(), { backfillDays: 90 });
    expect(fakeSupabase.__buildersFor('agent_activity')).toHaveLength(0);
  });

  it('steady run: no-ops the unchanged day, inserts the new one, no backfill', async () => {
    setIndicators([hashRate()]);
    setObservations([{ indicator_id: 'i-hr', id: 'o1', observed_at: '2026-06-19', value: 641 }]);
    adapterResult = { ok: true, observations: [obs('2026-06-19', 641), obs('2026-06-20', 642)] };

    const out = await runOnchainPoll(ROUTINE, NOW);

    expect(out.onchain_poll_result).toMatchObject({ observations_inserted: 1, no_op: 1 });
    expect(fetchLatest).toHaveBeenCalledWith(expect.anything(), undefined); // has history → no backfill
  });

  it('revision: supersedes the prior vintage when the same day reports a new value', async () => {
    setIndicators([hashRate()]);
    setObservations([{ indicator_id: 'i-hr', id: 'o1', observed_at: '2026-06-20', value: 640 }]);
    adapterResult = { ok: true, observations: [obs('2026-06-20', 650)] };

    const out = await runOnchainPoll(ROUTINE, NOW);

    expect(out.onchain_poll_result).toMatchObject({ observations_superseded: 1, observations_inserted: 0 });
    const updates = fakeSupabase
      .__buildersFor('onchain_observations')
      .flatMap((b) => b.update.mock.calls.map((c) => c[0] as Record<string, unknown>));
    expect(updates).toContainEqual({ is_current: false });
  });

  it('unchanged value is a no-op (rounded to the column scale)', async () => {
    setIndicators([hashRate()]);
    setObservations([{ indicator_id: 'i-hr', id: 'o1', observed_at: '2026-06-20', value: 642.123457 }]);
    adapterResult = { ok: true, observations: [obs('2026-06-20', 642.1234567)] }; // extra precision → rounds equal

    const out = await runOnchainPoll(ROUTINE, NOW);

    expect(out.onchain_poll_result).toMatchObject({ no_op: 1, observations_inserted: 0, observations_superseded: 0 });
    expect(obsInsertCount()).toBe(0);
  });

  it('a failing provider is recorded and the sweep still succeeds', async () => {
    setIndicators([hashRate()]);
    setObservations([]);
    adapterResult = { ok: false, error: { kind: 'transport', message: 'mempool down' } };

    const out = await runOnchainPoll(ROUTINE, NOW);

    expect(out.status).toBe('success');
    expect(out.onchain_poll_result?.failed).toHaveLength(1);
    expect(out.onchain_poll_result?.observations_inserted).toBe(0);
  });
});

describe('runOnchainPoll — alerts', () => {
  const ribbons = () =>
    hashRate({
      id: 'i-ribbons',
      key: 'hash_ribbons',
      short_label: 'Hash Ribbons',
      derivation: 'derived',
      provider: null,
      provider_metric_code: null,
      alert_config: { on_signal_change: true },
    });

  it('proposes a compliance-sensitive Charlie beat when the Hash-Ribbons signal changes', async () => {
    setIndicators([ribbons()]);
    setObservations([]); // derived row is not polled
    setHashRibbons([
      { observed_at: '2026-06-20', signal: 'recovery', spread_pct: 0.5 },
      { observed_at: '2026-06-19', signal: 'capitulation', spread_pct: -0.4 },
    ]);

    const out = await runOnchainPoll(ROUTINE, NOW);

    expect(out.onchain_poll_result?.beats_proposed).toBe(1);
    const beats = beatInserts();
    expect(beats).toHaveLength(1);
    expect(beats[0]).toMatchObject({ agent_name: 'simon', entity_type: 'onchain_indicator', entity_id: 'i-ribbons' });
    const proposed = beats[0].proposed_actions as Array<{ agent: string; context: Record<string, unknown> }>;
    expect(proposed[0].agent).toBe('charlie');
    expect(proposed[0].context.compliance_sensitive).toBe(true);
  });

  it('does not propose when the signal is unchanged', async () => {
    setIndicators([ribbons()]);
    setObservations([]);
    setHashRibbons([
      { observed_at: '2026-06-20', signal: 'neutral', spread_pct: 0.3 },
      { observed_at: '2026-06-19', signal: 'neutral', spread_pct: 0.2 },
    ]);

    const out = await runOnchainPoll(ROUTINE, NOW);
    expect(out.onchain_poll_result?.beats_proposed).toBe(0);
    expect(beatInserts()).toHaveLength(0);
  });

  it('respects the weekly dedupe window', async () => {
    setIndicators([ribbons()]);
    setObservations([]);
    setHashRibbons([
      { observed_at: '2026-06-20', signal: 'recovery', spread_pct: 0.5 },
      { observed_at: '2026-06-19', signal: 'capitulation', spread_pct: -0.4 },
    ]);
    setRecentBeat(true); // already proposed this week

    const out = await runOnchainPoll(ROUTINE, NOW);
    expect(out.onchain_poll_result?.beats_proposed).toBe(0);
    expect(beatInserts()).toHaveLength(0);
  });
});
