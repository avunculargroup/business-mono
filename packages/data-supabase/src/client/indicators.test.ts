import { describe, expect, it } from 'vitest';
import type { Principal, ReadContext } from '@platform/data';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase';
import { createClientAdapterContext, type ClientSupabaseClient } from './context';
import { createClientIndicatorRepository } from './repositories';

/**
 * The merged indicator read.
 *
 * The conformance suite exercises this repository through the canned-response
 * fake, which honours no filter — so it cannot tell whether `series()` sent a
 * macro key to the macro table or to `onchain_indicators.key`, where it would
 * match nothing in Postgres and the series would silently vanish. These cases
 * read the builders directly to assert the routing the fake cannot.
 */

const principal: Extract<Principal, { kind: 'client' }> = {
  kind: 'client',
  userId: 'client-user-1',
  accountId: 'account-1',
};

const readContext: ReadContext = { asOf: new Date('2026-09-20T00:00:00Z') };

const ONCHAIN_ROWS = [
  {
    key: 'btc_price_aud',
    name: 'Bitcoin price (AUD)',
    short_label: 'BTC/AUD',
    unit: 'AUD',
    decimals: 0,
    provider: 'Coin Metrics',
    poll_frequency: 'daily',
    onchain_observations: [
      { value: 167120, observed_at: '2026-09-09', is_current: true },
      { value: 168342.5, observed_at: '2026-09-10', is_current: true },
    ],
  },
];

/**
 * Two vintages of one period, plus a second period.
 *
 * `AU_CPI_ANNUAL` was revised: 3.1 was published for June and later superseded
 * by 3.2. Both rows stay on the table — that is what the revision columns are
 * for — so a read that ignores `is_current` renders June twice, once at the
 * number the ABS withdrew.
 */
const MACRO_ROWS = [
  {
    id: 'macro-cpi',
    name: 'Australian CPI, annual',
    short_label: 'CPI',
    unit: 'percent',
    decimals: 1,
    provider: 'ABS',
    period_granularity: 'quarterly',
    indicator_observations: [
      { value: 3.1, period_date: '2026-06-01', is_current: false },
      { value: 3.2, period_date: '2026-06-01', is_current: true },
      { value: 2.9, period_date: '2026-03-01', is_current: true },
    ],
  },
];

function repository(client: FakeSupabaseClient) {
  const adapter = createClientAdapterContext(
    client as unknown as ClientSupabaseClient,
    principal,
  );
  return createClientIndicatorRepository(adapter);
}

function seed(client: FakeSupabaseClient): void {
  client.__setResponse('compliance_documents', { data: { version: '2.1' }, error: null });
  client.__setResponse('client_disclosures', { data: { id: 'ack-1' }, error: null });
  client.__setResponse('onchain_indicators', { data: ONCHAIN_ROWS, error: null });
  client.__setResponse('economic_indicators', { data: MACRO_ROWS, error: null });
}

describe('client indicator repository', () => {
  it('advertises both catalogues, each key naming its own table', async () => {
    const client = createFakeSupabase();
    seed(client);

    const available = await repository(client).available(readContext);

    expect(available).toEqual([
      { key: 'onchain:btc_price_aud', label: 'BTC/AUD' },
      { key: 'macro:macro-cpi', label: 'CPI' },
    ]);
  });

  it('gates the macro catalogue on is_active, the only flag that table carries', async () => {
    const client = createFakeSupabase();
    seed(client);

    await repository(client).available(readContext);

    const [macro] = client.__buildersFor('economic_indicators');
    expect(macro.eq).toHaveBeenCalledWith('is_active', true);
    // `economic_indicators` has no `is_displayed` column, so asking for one
    // would be a 400 from PostgREST rather than a narrower list.
    expect(macro.eq).not.toHaveBeenCalledWith('is_displayed', true);
  });

  it('sends each key back to the table it came from', async () => {
    const client = createFakeSupabase();
    seed(client);

    await repository(client).series(readContext, [
      'onchain:btc_price_aud',
      'macro:macro-cpi',
    ]);

    const [onchain] = client.__buildersFor('onchain_indicators');
    const [macro] = client.__buildersFor('economic_indicators');

    // The prefix is stripped: Postgres holds the bare slug and the bare id.
    expect(onchain.in).toHaveBeenCalledWith('key', ['btc_price_aud']);
    expect(macro.in).toHaveBeenCalledWith('id', ['macro-cpi']);
  });

  it('does not query a table no key addresses', async () => {
    const client = createFakeSupabase();
    seed(client);

    await repository(client).series(readContext, ['onchain:btc_price_aud']);

    expect(client.__buildersFor('economic_indicators')).toHaveLength(0);
  });

  it('serves a macro series from the current vintage only', async () => {
    const client = createFakeSupabase();
    seed(client);

    const series = await repository(client).series(readContext, ['macro:macro-cpi']);

    expect(series).toEqual([
      {
        key: 'macro:macro-cpi',
        label: 'CPI',
        unit: 'percent',
        sourceName: 'ABS',
        // From period_granularity ('quarterly'), never poll_frequency.
        expectedCadenceDays: 92,
        lastObservedAt: '2026-06-01',
        points: [
          { at: '2026-03-01', value: '2.9' },
          { at: '2026-06-01', value: '3.2' },
        ],
      },
    ]);
  });

  it('reads the macro cadence from the period, not the poll frequency', async () => {
    const client = createFakeSupabase();
    seed(client);
    client.__setResponse('economic_indicators', {
      // The RBA cash rate is polled daily so a decision is caught the same day,
      // but it prints monthly. Reading poll_frequency here would call it stale
      // every day after the print.
      data: [{ ...MACRO_ROWS[0], period_granularity: 'monthly', poll_frequency: 'daily' }],
      error: null,
    });

    const [series] = await repository(client).series(readContext, ['macro:macro-cpi']);

    expect(series.expectedCadenceDays).toBe(31);
  });

  it('honours fromDate on the macro side', async () => {
    const client = createFakeSupabase();
    seed(client);

    const [series] = await repository(client).series(
      readContext,
      ['macro:macro-cpi'],
      '2026-05-01',
    );

    expect(series.points).toEqual([{ at: '2026-06-01', value: '3.2' }]);
  });

  it('drops a key with no prefix rather than guessing a table for it', async () => {
    const client = createFakeSupabase();
    seed(client);

    const series = await repository(client).series(readContext, ['btc_price_aud']);

    expect(series).toEqual([]);
    expect(client.__buildersFor('onchain_indicators')).toHaveLength(0);
    expect(client.__buildersFor('economic_indicators')).toHaveLength(0);
  });

  it('still refuses every read when the disclosure is not acknowledged', async () => {
    const client = createFakeSupabase();
    seed(client);
    client.__setResponse('client_disclosures', { data: null, error: null });

    const indicators = repository(client);

    await expect(indicators.available(readContext)).rejects.toThrow();
    await expect(indicators.series(readContext, ['macro:macro-cpi'])).rejects.toThrow();
  });
});
