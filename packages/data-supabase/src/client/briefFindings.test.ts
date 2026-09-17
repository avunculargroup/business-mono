import { describe, expect, it } from 'vitest';
import {
  buildMetricCatalog,
  evidenceFor,
  provenanceFor,
  toClientFinding,
  type MacroCatalogRow,
  type OnchainCatalogRow,
} from './briefFindings';

/**
 * The shape the findings engine actually writes.
 *
 * Copied from a published `market_reports` row rather than invented, because
 * the bug this module exists to fix was a shape mismatch: the adapter read
 * `headline`, `detail` and `provenance`, and nothing has ever written any of
 * the three. A fixture written from the read model's own vocabulary would have
 * agreed with the broken code.
 */
const STORED_STREAK = {
  id: 'streak:realized_vol_30d:2026-09-17',
  as_of: '2026-09-16',
  period: 'day',
  baseline: {
    sd: 7.631069706286495,
    p05: 23.307387577062045,
    p50: 34.385236285535356,
    p95: 47.688220266613286,
    mean: 37.03808812319323,
  },
  observed: 10,
  direction: 'flat_break',
  metric_key: 'realized_vol_30d',
  materiality: 0.5527994718880405,
  unusualness: 0.7142857142857143,
  window_days: 90,
  finding_type: 'streak',
  metric_group: 'trend_valuation',
  allowed_vocab: ['trend', 'momentum', 'range', 'volatility', 'drawdown'],
  evidence_refs: ['view:v_onchain_series', 'key:realized_vol_30d', 'date:2026-09-16'],
  magnitude_norm: 0.4347981516081415,
  narration_hint: {
    means: 'Volatility (30d) has held between 46.9 and 51.8 for 10 consecutive days',
    noise_note: 'the persistence is the story, not the level',
    verdict_allowed: true,
  },
  compliance_class: 'informational',
  persistence_periods: 10,
};

const ONCHAIN: OnchainCatalogRow[] = [
  {
    key: 'btc_price_usd',
    short_label: 'BTC/USD',
    unit: 'usd',
    decimals: 0,
    provider: 'coinmetrics',
    provider_metric_code: 'PriceUSD',
    derivation_spec: {},
  },
  {
    key: 'ma_200d',
    short_label: '200-Day MA',
    unit: 'usd',
    decimals: 0,
    provider: null,
    derivation_spec: { type: 'sma', source_key: 'btc_price_usd', window_days: 200 },
  },
  {
    key: 'mayer_multiple',
    short_label: 'Mayer Multiple',
    unit: 'ratio',
    decimals: 2,
    provider: null,
    derivation_spec: { type: 'ratio', denominator: 'ma_200d', numerator_key: 'btc_price_usd' },
  },
  {
    key: 'realized_vol_30d',
    short_label: 'Volatility (30d)',
    unit: 'percent',
    decimals: 1,
    provider: null,
    derivation_spec: { type: 'volatility', source_key: 'btc_price_usd', window_days: 30 },
  },
  {
    key: 'fear_greed',
    short_label: 'Fear & Greed',
    unit: 'index',
    decimals: 0,
    provider: 'alternative_me',
    provider_metric_code: 'fng.value',
    derivation_spec: {},
  },
];

const MACRO: MacroCatalogRow[] = [
  {
    short_label: 'Fed Funds',
    name: 'US Federal Funds Rate',
    unit: 'percent',
    decimals: 2,
    provider: 'fred',
    provider_series_code: 'FEDFUNDS',
  },
  {
    short_label: 'RBA Cash Rate',
    name: 'RBA Cash Rate Target',
    unit: 'percent',
    decimals: 2,
    provider: 'rba',
    provider_table_ref: 'F1.1',
  },
];

const catalog = buildMetricCatalog(ONCHAIN, MACRO);

describe('the metric catalogue', () => {
  it('keys a macro series the way the findings engine spells it', () => {
    // The engine writes `macro:fed_funds`; a catalogue keyed on the label would
    // match nothing and every macro finding would lose its source.
    expect(catalog.get('macro:fed_funds')?.label).toBe('Fed Funds');
    expect(catalog.get('macro:rba_cash_rate')?.provider).toBe('rba');
  });

  it('keys an onchain series on its own key, unprefixed', () => {
    expect(catalog.get('btc_price_usd')?.label).toBe('BTC/USD');
  });
});

describe('provenance', () => {
  it('names the provider of a fetched series', () => {
    const [source] = provenanceFor('fear_greed', '2026-09-16', catalog, 'threshold');

    expect(source!.sourceName).toBe('Alternative.me');
    expect(source!.basis).toBe('reported');
    expect(source!.asAt).toBe('2026-09-16');
  });

  it('walks a derivation chain to the series that was actually published', () => {
    // The Mayer Multiple is a ratio of BTC/USD to its own 200-day average, and
    // the average is derived too. Stopping at the first hop is how a finding
    // ends up rendering "Source not attached" over perfectly good provenance.
    const [source] = provenanceFor('mayer_multiple', '2026-09-16', catalog, 'threshold');

    expect(source!.sourceName).toBe('Coin Metrics');
    expect(source!.basis).toBe('derived');
  });

  it('does not attribute this platform arithmetic to the provider', () => {
    // Coin Metrics publishes BTC/USD. It does not publish "fell 3.4% over the
    // day" — that figure is computed here, so the rail must not read "as
    // published" over it even though the series behind it was fetched.
    const [asPublished] = provenanceFor('btc_price_usd', '2026-09-16', catalog, 'threshold');
    const [computed] = provenanceFor('btc_price_usd', '2026-09-16', catalog, 'anomaly');

    expect(asPublished!.basis).toBe('reported');
    expect(computed!.basis).toBe('derived');
  });

  it('collects every upstream provider of a metric derived from several', () => {
    const multi = buildMetricCatalog(
      [
        ...ONCHAIN,
        { key: 'realised_cap', short_label: 'Realised Cap', provider: 'bgeometrics', derivation_spec: {} },
        { key: 'supply', short_label: 'Supply', provider: 'coinmetrics', derivation_spec: {} },
        {
          key: 'mvrv',
          short_label: 'MVRV',
          provider: null,
          derivation_spec: { inputs: ['btc_price_usd', 'supply', 'realised_cap'] },
        },
      ],
      MACRO,
    );

    expect(provenanceFor('mvrv', '2026-09-16', multi, 'anomaly').map((p) => p.sourceName)).toEqual([
      'Coin Metrics',
      'BGeometrics',
    ]);
  });

  it('deep-links a FRED series and falls back to a home page elsewhere', () => {
    expect(provenanceFor('macro:fed_funds', '2026-09-16', catalog)[0]!.sourceUrl).toBe(
      'https://fred.stlouisfed.org/series/FEDFUNDS',
    );
    expect(provenanceFor('macro:rba_cash_rate', '2026-09-16', catalog)[0]!.sourceUrl).toBe(
      'https://www.rba.gov.au/statistics/tables/',
    );
  });

  it('returns nothing for a metric the catalogue does not hold', () => {
    // Which the page renders as a stated absence. Inventing a plausible source
    // for an unknown key is the one outcome worse than saying none is attached.
    expect(provenanceFor('a_series_nobody_registered', '2026-09-16', catalog)).toEqual([]);
  });

  it('does not loop on a derivation spec that names a cycle', () => {
    const cyclic = buildMetricCatalog(
      [
        { key: 'a', short_label: 'A', provider: null, derivation_spec: { source_key: 'b' } },
        { key: 'b', short_label: 'B', provider: null, derivation_spec: { source_key: 'a' } },
      ],
      [],
    );

    expect(provenanceFor('a', '2026-09-16', cyclic)).toEqual([]);
  });
});

describe('evidence', () => {
  it('labels a streak by what it counts, not as an observed level', () => {
    const rows = evidenceFor(STORED_STREAK, 'streak', catalog.get('realized_vol_30d'));

    expect(rows[0]).toEqual({ label: 'Held for', value: '10 consecutive days' });
  });

  it('carries a streak trailing distribution in the series own units', () => {
    const rows = evidenceFor(STORED_STREAK, 'streak', catalog.get('realized_vol_30d'));
    const byLabel = new Map(rows.map((row) => [row.label, row.value]));

    expect(byLabel.get('Usual range (90d)')).toBe('23.3% to 47.7%');
    expect(byLabel.get('Median (90d)')).toBe('34.4%');
  });

  it('states a window in the finding own periods', () => {
    // The Fed Funds hold is a monthly series judged over two years. A label
    // reading "730d" is arithmetic the reader should not have to do.
    const rows = evidenceFor(
      { observed: 8, period: 'month', window_days: 730, baseline: { p05: 3.63, p50: 4.09, p95: 4.33 } },
      'streak',
      catalog.get('macro:fed_funds'),
    );

    expect(rows[0]!.value).toBe('8 consecutive months');
    expect(rows[1]!.label).toBe('Usual range (24 months)');
  });

  it('formats a threshold crossing to the indicator own decimals', () => {
    const rows = evidenceFor(
      { observed: 1.0412, period: 'day', baseline: {}, window_days: 90 },
      'threshold',
      catalog.get('mayer_multiple'),
    );

    expect(rows[0]).toEqual({ label: 'Observed', value: '1.04' });
  });

  /**
   * The trap this module is most likely to fall into.
   *
   * An anomaly's `observed` is a period-over-period percentage change, not the
   * series' value, and its baseline is the distribution of those changes. The
   * Mayer Multiple is a ratio with two decimals, so applying the indicator's
   * own units here would print -3.43 and call a percentage a ratio.
   */
  it('renders an anomaly as the percentage change it measures', () => {
    const rows = evidenceFor(
      {
        observed: -3.4250214617405415,
        period: 'day',
        window_days: 90,
        baseline: { p05: -2.3372635837729585, p50: 0.21422412218570513, p95: 3.8504219603655727 },
      },
      'anomaly',
      catalog.get('mayer_multiple'),
    );

    expect(rows).toEqual([
      { label: 'Change over the day', value: '-3.4%' },
      { label: 'Usual change (90d)', value: '-2.3% to 3.9%' },
      { label: 'Median (90d)', value: '0.2%' },
    ]);
  });

  it('claims no unit for an inflection, whose observed value has three meanings', () => {
    // Run length, forecast level, or moving-average spread, by series. Mirroring
    // the computor's key lists here would be a second copy of the engine's
    // internals; an unlabelled figure beside its own band is still legible.
    const rows = evidenceFor(
      {
        observed: 0.155002,
        period: 'day',
        window_days: 90,
        baseline: { p05: -3.8273342, p50: -0.656098, p95: 6.185885399999998 },
      },
      'inflection',
      { key: 'next_difficulty_adjustment', label: 'Next Diff Adj', unit: 'percent', decimals: 2, provider: 'mempool', providerCode: null, derivedFrom: [] },
    );

    expect(rows[0]).toEqual({ label: 'Observed', value: '0.16' });
    expect(rows[1]!.value).toBe('-3.83 to 6.19');
  });

  it('produces no row for a figure that is not there', () => {
    // An empty strip is what the page keys off to render nothing rather than a
    // panel of blanks, so a missing number must not become 'NaN'.
    expect(evidenceFor({ baseline: { p05: null } }, 'anomaly', undefined)).toEqual([]);
  });
});

describe('the projection', () => {
  const finding = toClientFinding(STORED_STREAK, 0, 'report-1', '2026-09-17', catalog);

  it('takes the headline from the plain-language hint the engine writes', () => {
    expect(finding.headline).toBe(
      'Volatility (30d) has held between 46.9 and 51.8 for 10 consecutive days',
    );
    // The engine writes the note as a fragment for a prompt. On a card it is a
    // sentence, so it is punctuated as one — and not otherwise reworded.
    expect(finding.detail).toBe('The persistence is the story, not the level.');
  });

  it('dates the finding by its observation, not by the report', () => {
    // The stored key is `as_of`. Reading only `as_at` is why the rail used to
    // print the day the report published rather than the day observed.
    expect(finding.asAt).toBe('2026-09-16');
  });

  it('attaches a source to a finding the engine stored without one', () => {
    expect(finding.provenance).toHaveLength(1);
    expect(finding.provenance[0]!.sourceName).toBe('Coin Metrics');
  });

  it('prefers a stored headline and stored provenance where they exist', () => {
    // Nothing writes them today. If anything ever does, an author's words must
    // win over a hint — so the fallback order is asserted rather than assumed.
    const authored = toClientFinding(
      {
        ...STORED_STREAK,
        headline: 'Written by hand',
        provenance: [{ source_name: 'A named page', source_url: 'https://example.invalid' }],
      },
      0,
      'report-1',
      '2026-09-17',
      catalog,
    );

    expect(authored.headline).toBe('Written by hand');
    expect(authored.provenance[0]!.sourceName).toBe('A named page');
  });

  it('survives a finding that is missing everything', () => {
    const empty = toClientFinding({}, 2, 'report-1', '2026-09-17', catalog);

    expect(empty.id).toBe('report-1-2');
    expect(empty.headline).toBe('');
    expect(empty.evidence).toEqual([]);
    expect(empty.provenance).toEqual([]);
    expect(empty.asAt).toBe('2026-09-17');
    // An unrecognised type falls to the least specific one rather than throwing
    // a page away over a label.
    expect(empty.findingType).toBe('anomaly');
  });
});
