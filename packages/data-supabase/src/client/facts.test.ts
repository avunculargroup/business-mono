import { describe, expect, it } from 'vitest';
import { macroMetricKey } from '@platform/shared';
import type { Principal, ReadContext } from '@platform/data';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase';
import { createClientAdapterContext, type ClientSupabaseClient } from './context';
import { FACT_SOURCES, resolveFacts } from './facts';

/**
 * Fact resolution, against rows shaped like the live tables.
 *
 * Every registry ref used to be checked only through the conformance fake,
 * whose macro rows carried a `provider_series_code` invented to match the
 * registry. Nothing compared the registry against what the database actually
 * holds, so two refs that match no column in any table looked fine for as long
 * as they existed.
 */

const principal: Extract<Principal, { kind: 'client' }> = {
  kind: 'client',
  userId: 'client-user-1',
  accountId: 'account-1',
};

const readContext: ReadContext = { asOf: new Date('2026-09-20T00:00:00Z') };

/** The live `economic_indicators` catalogue, by short_label and unit. */
const LIVE_MACRO_LABELS = [
  'AU Broad Money',
  'DXY',
  'Fed Funds',
  'Gold',
  'RBA Cash Rate',
  'S&P 500',
  'US 10Y',
  'US CPI',
  'US M2',
  'US Mfg Activity',
  // Seeded, not yet polled.
  'AU CPI',
  'AU Bus. Confidence',
];

const MACRO_ROWS = [
  {
    short_label: 'RBA Cash Rate',
    name: 'RBA Cash Rate Target',
    unit: 'percent',
    decimals: 2,
    provider: 'rba',
    indicator_observations: [{ value: 3.85, period_date: '2026-08-01' }],
  },
  {
    short_label: 'US M2',
    name: 'US M2 Money Supply',
    unit: 'usd_billion',
    decimals: 1,
    provider: 'fred',
    indicator_observations: [{ value: 22014.3, period_date: '2026-07-01' }],
  },
];

const ONCHAIN_ROWS = [
  {
    key: 'btc_price_aud',
    name: 'Bitcoin price (AUD)',
    short_label: 'BTC/AUD',
    unit: 'aud',
    decimals: 0,
    provider: 'coinmetrics',
    onchain_observations: [{ value: 168342.5, observed_at: '2026-09-10' }],
  },
];

function adapterFor(client: FakeSupabaseClient) {
  return createClientAdapterContext(
    client as unknown as ClientSupabaseClient,
    principal,
  );
}

function seed(client: FakeSupabaseClient): void {
  client.__setResponse('compliance_documents', { data: { version: '2.1' }, error: null });
  client.__setResponse('client_disclosures', { data: { id: 'ack-1' }, error: null });
  client.__setResponse('onchain_indicators', { data: ONCHAIN_ROWS, error: null });
  client.__setResponse('economic_indicators', { data: MACRO_ROWS, error: null });
}

describe('the fact registry', () => {
  it('names a macro series that exists in the live catalogue', () => {
    const live = new Set(LIVE_MACRO_LABELS.map(macroMetricKey));

    const macroRefs = Object.entries(FACT_SOURCES)
      .filter(([, source]) => source.kind === 'macro')
      .map(([key, source]) => [key, source.ref] as const);

    expect(macroRefs.length).toBeGreaterThan(0);
    for (const [key, ref] of macroRefs) {
      expect(
        live,
        `${key} points at "${ref}", which is not a metric key any economic_indicators `
          + 'row produces. AU_CASH_RATE and AU_CPI_ANNUAL were exactly this.',
      ).toContain(ref);
    }
  });

  it('writes every macro ref in the platform namespace', () => {
    for (const [key, source] of Object.entries(FACT_SOURCES)) {
      if (source.kind !== 'macro') continue;
      expect(source.ref, `${key} is not a macro metric key`).toMatch(/^macro:/);
    }
  });
});

describe('resolveFacts', () => {
  it('resolves a macro fact whose indicator has no provider_series_code', async () => {
    const client = createFakeSupabase();
    seed(client);

    const { facts, absent } = await resolveFacts(adapterFor(client), readContext, [
      'au_cash_rate',
    ]);

    // The RBA cash rate carries provider_table_ref 'F1.1' and a NULL series
    // code, which is why keying on that column could never have found it.
    expect(absent).toEqual([]);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      key: 'au_cash_rate',
      label: 'RBA cash rate target',
      value: '3.85%',
      asAt: '2026-08-01',
    });
  });

  it('appends the percent sign on the spelling the tables actually use', async () => {
    const client = createFakeSupabase();
    seed(client);

    const { facts } = await resolveFacts(adapterFor(client), readContext, ['au_cash_rate']);

    // Live rows spell it `percent`; `'%'` appears in neither indicator table,
    // so the old check matched nothing and eight active series lost their sign.
    expect(facts[0]!.value).toBe('3.85%');
  });

  it('leaves a non-percentage unit off the value', async () => {
    const client = createFakeSupabase();
    seed(client);

    const { facts } = await resolveFacts(adapterFor(client), readContext, ['btc_spot_aud']);

    expect(facts[0]!.value).toBe('168,343');
  });

  it('asks for the latest current vintage rather than any current one', async () => {
    const client = createFakeSupabase();
    seed(client);

    await resolveFacts(adapterFor(client), readContext, ['au_cash_rate', 'btc_spot_aud']);

    const [macro] = client.__buildersFor('economic_indicators');
    const [onchain] = client.__buildersFor('onchain_indicators');

    // is_current flags the live vintage of *each* period, so a series with
    // twenty months of history has twenty current rows. Taking the first of an
    // unordered embed put an arbitrary month on a board paper.
    expect(macro.eq).toHaveBeenCalledWith('indicator_observations.is_current', true);
    expect(macro.order).toHaveBeenCalledWith('period_date', {
      referencedTable: 'indicator_observations',
      ascending: false,
    });
    expect(macro.limit).toHaveBeenCalledWith(1, {
      referencedTable: 'indicator_observations',
    });
    expect(onchain.order).toHaveBeenCalledWith('observed_at', {
      referencedTable: 'onchain_observations',
      ascending: false,
    });
  });

  it('states an absence for a registered series the catalogue is not serving', async () => {
    const client = createFakeSupabase();
    seed(client);

    const { facts, absent } = await resolveFacts(adapterFor(client), readContext, [
      'au_cpi_annual',
    ]);

    // AU CPI is seeded inactive with no observations — the ABS adapter does not
    // exist — so this is the honest answer, and a different one from the
    // `not_cleared` that an unknown key gets.
    expect(facts).toEqual([]);
    expect(absent).toEqual([
      expect.objectContaining({ key: 'au_cpi_annual', reason: 'source_unavailable' }),
    ]);
  });
});
