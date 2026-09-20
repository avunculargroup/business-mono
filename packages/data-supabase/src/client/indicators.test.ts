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
 * macro key to the macro table, nor whether the vintage filter was issued at
 * all. These cases read the builders directly to assert the query the fake
 * cannot, because for these two tables an unfiltered or unordered read is the
 * bug rather than a slower path to the same answer.
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
    unit: 'aud',
    decimals: 0,
    provider: 'coinmetrics',
    poll_frequency: 'daily',
    // Newest first, as the query asks for.
    onchain_observations: [
      { value: 168342.5, observed_at: '2026-09-10' },
      { value: 167120, observed_at: '2026-09-09' },
    ],
  },
];

const MACRO_ROWS = [
  {
    short_label: 'RBA Cash Rate',
    name: 'RBA Cash Rate Target',
    unit: 'percent',
    decimals: 2,
    provider: 'rba',
    period_granularity: 'monthly',
    indicator_observations: [
      { value: 3.85, period_date: '2026-08-01' },
      { value: 3.6, period_date: '2026-07-01' },
    ],
  },
  {
    short_label: 'US M2',
    name: 'US M2 Money Supply',
    unit: 'usd_billion',
    decimals: 1,
    provider: 'fred',
    period_granularity: 'monthly',
    indicator_observations: [{ value: 22014.3, period_date: '2026-07-01' }],
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
  it('advertises both catalogues under the platform metric keys', async () => {
    const client = createFakeSupabase();
    seed(client);

    const available = await repository(client).available(readContext);

    // On-chain bare, macro slugged from short_label — the same namespace
    // `finding_divergence_pairs` and `market_reports.findings` are written in.
    expect(available).toEqual([
      { key: 'btc_price_aud', label: 'BTC/AUD' },
      { key: 'macro:rba_cash_rate', label: 'RBA Cash Rate' },
      { key: 'macro:us_m2', label: 'US M2' },
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

    await repository(client).series(readContext, ['btc_price_aud', 'macro:rba_cash_rate']);

    const [onchain] = client.__buildersFor('onchain_indicators');
    expect(onchain.in).toHaveBeenCalledWith('key', ['btc_price_aud']);
    // The macro slug is computed, so it is matched in the adapter rather than
    // pushed into the query — but only active rows are ever considered.
    const [macro] = client.__buildersFor('economic_indicators');
    expect(macro.eq).toHaveBeenCalledWith('is_active', true);
  });

  it('does not query a table no key addresses', async () => {
    const client = createFakeSupabase();
    seed(client);

    await repository(client).series(readContext, ['btc_price_aud']);

    expect(client.__buildersFor('economic_indicators')).toHaveLength(0);
  });

  it('returns only the macro series asked for, not the whole active catalogue', async () => {
    const client = createFakeSupabase();
    seed(client);

    const series = await repository(client).series(readContext, ['macro:us_m2']);

    // The query cannot express the slug, so the narrowing happens here — and
    // the fake hands back both rows precisely so this asserts it.
    expect(series.map((one) => one.key)).toEqual(['macro:us_m2']);
  });

  // --------------------------------------------------------
  // The vintage filter, on both sides
  // --------------------------------------------------------

  it('asks the database for current vintages only, on both tables', async () => {
    const client = createFakeSupabase();
    seed(client);

    await repository(client).series(readContext, ['btc_price_aud', 'macro:rba_cash_rate']);

    const [onchain] = client.__buildersFor('onchain_indicators');
    const [macro] = client.__buildersFor('economic_indicators');

    // Superseded rows stay on both tables as history. btc_price_usd alone
    // carries 89k demoted vintages against 2,670 live ones, so this is the
    // difference between a correct series and an arbitrary slice of one.
    expect(onchain.eq).toHaveBeenCalledWith('onchain_observations.is_current', true);
    expect(macro.eq).toHaveBeenCalledWith('indicator_observations.is_current', true);
  });

  it('orders newest-first and caps, so a capped read keeps the newest end', async () => {
    const client = createFakeSupabase();
    seed(client);

    await repository(client).series(readContext, ['btc_price_aud', 'macro:rba_cash_rate']);

    const [onchain] = client.__buildersFor('onchain_indicators');
    const [macro] = client.__buildersFor('economic_indicators');

    // An embedded resource has no order unless one is asked for, and max-rows
    // truncates silently, so without both of these `points.at(-1)` is whatever
    // PostgREST felt like returning.
    expect(onchain.order).toHaveBeenCalledWith('observed_at', {
      referencedTable: 'onchain_observations',
      ascending: false,
    });
    expect(onchain.limit).toHaveBeenCalledWith(400, {
      referencedTable: 'onchain_observations',
    });
    expect(macro.order).toHaveBeenCalledWith('period_date', {
      referencedTable: 'indicator_observations',
      ascending: false,
    });
  });

  it('returns points oldest-first whatever order the query asked for', async () => {
    const client = createFakeSupabase();
    seed(client);

    const [series] = await repository(client).series(readContext, ['btc_price_aud']);

    // The read model's points run oldest-first and the page reads .at(-1) as
    // the latest, so the descending query has to be turned back around.
    expect(series.points).toEqual([
      { at: '2026-09-09', value: '167,120' },
      { at: '2026-09-10', value: '168,343' },
    ]);
    expect(series.lastObservedAt).toBe('2026-09-10');
  });

  // --------------------------------------------------------
  // Cadence
  // --------------------------------------------------------

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

    const [series] = await repository(client).series(readContext, ['macro:rba_cash_rate']);

    expect(series.expectedCadenceDays).toBe(31);
  });

  it('carries the macro label, unit and provider through unchanged', async () => {
    const client = createFakeSupabase();
    seed(client);

    const [series] = await repository(client).series(readContext, ['macro:rba_cash_rate']);

    expect(series).toMatchObject({
      key: 'macro:rba_cash_rate',
      label: 'RBA Cash Rate',
      unit: 'percent',
      sourceName: 'rba',
      lastObservedAt: '2026-08-01',
    });
    expect(series.points.at(-1)).toEqual({ at: '2026-08-01', value: '3.85' });
  });

  it('pushes fromDate into the query rather than filtering after the fact', async () => {
    const client = createFakeSupabase();
    seed(client);

    await repository(client).series(readContext, ['btc_price_aud'], '2026-05-01');

    const [onchain] = client.__buildersFor('onchain_indicators');
    // Filtering in the adapter after an unbounded fetch would read the whole
    // history to throw most of it away, and the cap would already have chosen
    // which part survived.
    expect(onchain.gte).toHaveBeenCalledWith(
      'onchain_observations.observed_at',
      '2026-05-01',
    );
  });

  it('still refuses every read when the disclosure is not acknowledged', async () => {
    const client = createFakeSupabase();
    seed(client);
    client.__setResponse('client_disclosures', { data: null, error: null });

    const indicators = repository(client);

    await expect(indicators.available(readContext)).rejects.toThrow();
    await expect(
      indicators.series(readContext, ['macro:rba_cash_rate']),
    ).rejects.toThrow();
  });
});
