import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';
import type { AdapterResult, ProviderAdapter } from './types.js';

const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
let adapterResult: AdapterResult;
const fetchLatest = vi.fn(async (): Promise<AdapterResult> => adapterResult);
const adapter: ProviderAdapter = { provider: 'fred', fetchLatest };

vi.mock('@platform/db', () => ({ get supabase() { return fakeSupabase; } }));
vi.mock('./registry.js', () => ({ getAdapter: () => adapter }));

const { runIndicatorPoll } = await import('./runIndicatorPoll.js');

const NOW = new Date('2026-06-20T00:00:00Z'); // Friday; daily indicators always due
const ROUTINE = {
  id: 'r1',
  name: 'Daily economic indicator poll',
  action_type: 'indicator_poll',
  action_config: {},
  frequency: 'daily',
  time_of_day: '08:00',
  timezone: 'Australia/Melbourne',
};

function indicator(overrides: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    name: 'US M2 Money Supply',
    short_label: 'US M2',
    category: 'money_supply',
    provider: 'fred',
    provider_series_code: 'M2SL',
    provider_table_ref: null,
    unit: 'usd_billion',
    decimals: 1,
    poll_frequency: 'daily',
    alert_on_new_print: true,
    alert_change_threshold: null,
    ...overrides,
  };
}

function obs(periodDate: string, value: number, releasedAt: string | null = null) {
  return { periodDate, value, releasedAt, raw: { date: periodDate, value: String(value) } };
}

function setIndicators(rows: unknown[]) {
  fakeSupabase.__setResponse('economic_indicators', { data: rows, error: null });
}
function setCurrentObs(rows: unknown[]) {
  fakeSupabase.__setResponse('indicator_observations', { data: rows, error: null });
}
function setRecentBeat(present: boolean) {
  fakeSupabase.__setResponse('agent_activity', { data: present ? { id: 'a1' } : null, error: null });
}
function obsInsertCount() {
  return fakeSupabase
    .__buildersFor('indicator_observations')
    .reduce((n, b) => n + b.insert.mock.calls.length, 0);
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

describe('runIndicatorPoll', () => {
  it('first ingest: inserts the full backfill and proposes no beat', async () => {
    setIndicators([indicator()]);
    setCurrentObs([]);
    adapterResult = { ok: true, observations: [obs('2026-03-01', 21290.5), obs('2026-04-01', 21330), obs('2026-05-01', 21399)] };

    const out = await runIndicatorPoll(ROUTINE, NOW);

    expect(out.status).toBe('success');
    expect(out.indicator_poll_result).toMatchObject({ observations_inserted: 3, beats_proposed: 0, no_op: 0 });
    expect(obsInsertCount()).toBe(3);
    // First ingest never proposes — no agent_activity touched at all.
    expect(fakeSupabase.__buildersFor('agent_activity')).toHaveLength(0);
  });

  it('new latest print on a tracked series: no-ops the unchanged period, inserts the new one, proposes a Charlie beat', async () => {
    setIndicators([indicator()]);
    setCurrentObs([{ id: 'o-apr', period_date: '2026-04-01', value: 21330, released_at: '2026-05-10' }]);
    adapterResult = { ok: true, observations: [obs('2026-04-01', 21330), obs('2026-05-01', 21399)] };

    const out = await runIndicatorPoll(ROUTINE, NOW);

    expect(out.indicator_poll_result).toMatchObject({ observations_inserted: 1, no_op: 1, beats_proposed: 1 });
    const beats = beatInserts();
    expect(beats).toHaveLength(1);
    expect(beats[0]).toMatchObject({ agent_name: 'simon', entity_type: 'economic_indicator', entity_id: 'i1' });
    const proposed = beats[0].proposed_actions as Array<{ agent: string }>;
    expect(proposed[0].agent).toBe('charlie');
  });

  it('revision: supersedes the prior vintage when the value changes', async () => {
    setIndicators([indicator({ alert_on_new_print: false })]); // isolate revision mechanics
    setCurrentObs([{ id: 'o-may', period_date: '2026-05-01', value: 21360, released_at: '2026-05-27' }]);
    adapterResult = { ok: true, observations: [obs('2026-05-01', 21399)] };

    const out = await runIndicatorPoll(ROUTINE, NOW);

    expect(out.indicator_poll_result).toMatchObject({ observations_superseded: 1, observations_inserted: 0, beats_proposed: 0 });
    const updates = fakeSupabase
      .__buildersFor('indicator_observations')
      .flatMap((b) => b.update.mock.calls.map((c) => c[0] as Record<string, unknown>));
    expect(updates).toContainEqual({ is_current: false });
  });

  it('unchanged value is a no-op', async () => {
    setIndicators([indicator({ alert_on_new_print: false })]);
    setCurrentObs([{ id: 'o-may', period_date: '2026-05-01', value: 21399, released_at: '2026-05-27' }]);
    adapterResult = { ok: true, observations: [obs('2026-05-01', 21399)] };

    const out = await runIndicatorPoll(ROUTINE, NOW);

    expect(out.indicator_poll_result).toMatchObject({ no_op: 1, observations_inserted: 0, observations_superseded: 0 });
    expect(obsInsertCount()).toBe(0);
  });

  it('a failing provider is recorded and the sweep still succeeds', async () => {
    setIndicators([indicator()]);
    setCurrentObs([]);
    adapterResult = { ok: false, error: { kind: 'transport', message: 'FRED down' } };

    const out = await runIndicatorPoll(ROUTINE, NOW);

    expect(out.status).toBe('success');
    expect(out.indicator_poll_result?.failed).toHaveLength(1);
    expect(out.indicator_poll_result?.observations_inserted).toBe(0);
  });

  it('does not propose a second beat within the dedupe window', async () => {
    setIndicators([indicator()]);
    setCurrentObs([{ id: 'o-apr', period_date: '2026-04-01', value: 21330, released_at: '2026-05-10' }]);
    setRecentBeat(true); // a beat was already proposed this week
    adapterResult = { ok: true, observations: [obs('2026-05-01', 21399)] };

    const out = await runIndicatorPoll(ROUTINE, NOW);

    expect(out.indicator_poll_result).toMatchObject({ observations_inserted: 1, beats_proposed: 0 });
    expect(beatInserts()).toHaveLength(0);
  });
});
