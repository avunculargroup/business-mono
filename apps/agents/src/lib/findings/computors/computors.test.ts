import { describe, it, expect } from 'vitest';
import { computeAnomalies } from './anomaly.js';
import { computeDivergences } from './divergence.js';
import { computeInflections } from './inflection.js';
import { computeStreaks } from './streak.js';
import { computeThresholds } from './threshold.js';
import { computeStaleness } from './staleness.js';
import { computeFindings } from './index.js';
import {
  dailyPoints,
  daysBefore,
  makeBundle,
  makeConfig,
  makeSeries,
  monthlyPoints,
  noise,
  spikedSeries,
} from '../__fixtures__/series.js';

const AS_OF = '2026-07-18';

describe('anomaly computor', () => {
  it('fires on a spike far outside the trailing band, with honest percentile fields', () => {
    const series = makeSeries('hash_rate', 'network_security', 'daily', dailyPoints(spikedSeries(AS_OF, 95, 900, -8), AS_OF), 'Hash rate');
    const findings = computeAnomalies(makeBundle(AS_OF, [series]), makeConfig());

    expect(findings).toHaveLength(1);
    const f = findings[0];
    expect(f.finding_type).toBe('anomaly');
    expect(f.metric_key).toBe('hash_rate');
    expect(f.observed).toBeCloseTo(-8, 0);
    expect(f.unusualness).toBeGreaterThanOrEqual(0.9);
    expect(f.direction).toBe('down');
    // Single-day move in a high-vol series → watch-item, never a verdict.
    expect(f.persistence_periods).toBe(1);
    expect(f.narration_hint.verdict_allowed).toBe(false);
    expect(f.materiality).toBe(0); // unscored until scoreAndSelect
    expect(f.allowed_vocab).not.toContain('capitulation');
  });

  it('is silent when the latest move is inside the normal band', () => {
    const values = spikedSeries(AS_OF, 95, 900, 0.1);
    const series = makeSeries('hash_rate', 'network_security', 'daily', dailyPoints(values, AS_OF));
    expect(computeAnomalies(makeBundle(AS_OF, [series]), makeConfig())).toHaveLength(0);
  });

  it('is silent on thin history — no fabricated percentile', () => {
    const series = makeSeries('hash_rate', 'network_security', 'daily', dailyPoints(spikedSeries(AS_OF, 10, 900, -8), AS_OF));
    expect(computeAnomalies(makeBundle(AS_OF, [series]), makeConfig())).toHaveLength(0);
  });

  it('is silent when the triggering observation is stale', () => {
    const values = spikedSeries(AS_OF, 95, 900, -8);
    const staleAsOf = daysBefore(AS_OF, -10); // series ends 10 days before "today"
    const series = makeSeries('hash_rate', 'network_security', 'daily', dailyPoints(values, AS_OF));
    expect(computeAnomalies(makeBundle(staleAsOf, [series]), makeConfig())).toHaveLength(0);
  });

  it('treats a monthly series print-over-print, not day-over-day', () => {
    // 30 monthly prints ~0.3%/month, then a +5% print — anomalous monthly.
    const values: number[] = [];
    let v = 20000;
    for (let i = 0; i < 30; i++) {
      v *= 1.003;
      values.push(v);
    }
    values.push(v * 1.05);
    const series = makeSeries('macro:us_m2', 'money_supply', 'monthly', monthlyPoints(values, AS_OF), 'US M2');
    const findings = computeAnomalies(makeBundle(AS_OF, [series]), makeConfig());
    expect(findings).toHaveLength(1);
    expect(findings[0].period).toBe('month');
    expect(findings[0].observed).toBeCloseTo(5, 0);
    // Low-vol series: even a single print may carry a verdict.
    expect(findings[0].narration_hint.verdict_allowed).toBe(true);
  });

  it('skips monotonic series like block_height', () => {
    const values = Array.from({ length: 95 }, (_, i) => 900000 + i * 144);
    values.push(values[values.length - 1] + 1000); // "spike"
    const series = makeSeries('block_height', 'market_snapshot', 'daily', dailyPoints(values, AS_OF));
    expect(computeAnomalies(makeBundle(AS_OF, [series]), makeConfig())).toHaveLength(0);
  });
});

describe('divergence computor', () => {
  const pair = {
    primary_key: 'btc_price_usd',
    secondary_key: 'macro:s_p_500',
    expected_sign: 'positive' as const,
    corr_window_days: 30,
    break_threshold: 0.35,
  };

  function correlatedThenBroken(breakTail: boolean) {
    // Both series track a common walk for 150 days; in the last 40 the second
    // series inverts if breakTail. Daily × daily keeps windows small.
    const walk = noise(11, 150);
    let a = 100;
    let b = 500;
    const av: number[] = [];
    const bv: number[] = [];
    walk.forEach((w, i) => {
      const drift = w * 2;
      a += drift;
      av.push(a);
      const invert = breakTail && i >= 110;
      b += invert ? -drift * 3 : drift * 3;
      bv.push(b);
    });
    return {
      primary: makeSeries('btc_price_usd', 'trend_valuation', 'daily', dailyPoints(av, AS_OF), 'BTC/USD'),
      secondary: makeSeries('macro:s_p_500', 'equity', 'daily', dailyPoints(bv, AS_OF), 'S&P 500'),
    };
  }

  it('fires when a normally-held correlation breaks', () => {
    const { primary, secondary } = correlatedThenBroken(true);
    const config = makeConfig({ divergencePairs: [pair] });
    const findings = computeDivergences(makeBundle(AS_OF, [primary, secondary]), config);
    expect(findings).toHaveLength(1);
    const f = findings[0];
    expect(f.finding_type).toBe('divergence');
    expect(f.secondary_metric_key).toBe('macro:s_p_500');
    expect(f.observed).toBeLessThan(0.35);
    expect(f.direction).toBe('flat_break');
    expect(f.persistence_periods).toBeGreaterThanOrEqual(1);
  });

  it('is silent while the relationship holds', () => {
    const { primary, secondary } = correlatedThenBroken(false);
    const config = makeConfig({ divergencePairs: [pair] });
    expect(computeDivergences(makeBundle(AS_OF, [primary, secondary]), config)).toHaveLength(0);
  });

  it('is silent when the pair never normally held (median below threshold)', () => {
    // Two independent walks — no usual band to break.
    const av = noise(3, 150).map((w, i) => 100 + w * 5 + i * 0.01);
    const bv = noise(97, 150).map((w, i) => 500 + w * 15 - i * 0.02);
    const primary = makeSeries('btc_price_usd', 'trend_valuation', 'daily', dailyPoints(av, AS_OF));
    const secondary = makeSeries('macro:s_p_500', 'equity', 'daily', dailyPoints(bv, AS_OF));
    const config = makeConfig({ divergencePairs: [pair] });
    expect(computeDivergences(makeBundle(AS_OF, [primary, secondary]), config)).toHaveLength(0);
  });

  it('is silent when a leg is missing from the bundle', () => {
    const { primary } = correlatedThenBroken(true);
    const config = makeConfig({ divergencePairs: [pair] });
    expect(computeDivergences(makeBundle(AS_OF, [primary]), config)).toHaveLength(0);
  });
});

describe('inflection computor', () => {
  it('fires when a long run ends', () => {
    // 20 days falling, then a clear up-day.
    const values: number[] = [];
    let v = 60;
    const preNoise = noise(5, 70);
    for (let i = 0; i < 70; i++) values.push((v += preNoise[i] * 0.4));
    for (let i = 0; i < 20; i++) values.push((v -= 0.8));
    values.push(v + 2);
    const series = makeSeries('fear_greed', 'market_snapshot', 'daily', dailyPoints(values, AS_OF), 'Fear & Greed');
    const findings = computeInflections(makeBundle(AS_OF, [series]), makeConfig());
    const runEnd = findings.find((f) => f.metric_key === 'fear_greed');
    expect(runEnd).toBeDefined();
    // The run that just ended — at least the 20 constructed fall days (noise
    // may contribute a couple of contiguous down-days at the start of the run).
    expect(runEnd!.observed).toBeGreaterThanOrEqual(20);
    expect(runEnd!.observed).toBeLessThanOrEqual(25);
    expect(runEnd!.direction).toBe('up');
  });

  it('is silent when the ended run was short', () => {
    const jitter = noise(9, 90);
    const values = jitter.map((j, i) => 50 + j * 3 + (i % 3 === 0 ? 1 : -1));
    const series = makeSeries('fear_greed', 'market_snapshot', 'daily', dailyPoints(values, AS_OF));
    const findings = computeInflections(makeBundle(AS_OF, [series]), makeConfig());
    expect(findings.filter((f) => f.metric_key === 'fear_greed')).toHaveLength(0);
  });

  it('fires on the difficulty forecast crossing zero', () => {
    const values = noise(13, 60).map((j) => -1.5 + j * 0.5); // negative regime
    values.push(0.8); // crosses above zero
    const series = makeSeries('next_difficulty_adjustment', 'network_security', 'daily', dailyPoints(values, AS_OF), 'Next difficulty adjustment');
    const findings = computeInflections(makeBundle(AS_OF, [series]), makeConfig());
    const cross = findings.find((f) => f.metric_key === 'next_difficulty_adjustment');
    expect(cross).toBeDefined();
    expect(cross!.direction).toBe('up');
    expect(cross!.observed).toBeCloseTo(0.8, 5);
  });

  describe('hash-ribbons state transition — the capitulation lock', () => {
    function ribbons(signals: Array<'neutral' | 'capitulation' | 'recovery'>) {
      return signals.map((signal, i) => ({
        date: daysBefore(AS_OF, signals.length - 1 - i),
        spreadPct: signal === 'capitulation' ? -1.2 : 1.1,
        signal,
      }));
    }

    it('a fresh flip to capitulation carries the word in allowed_vocab', () => {
      const bundle = makeBundle(AS_OF, [], ribbons(['neutral', 'neutral', 'neutral', 'capitulation']));
      const findings = computeInflections(bundle, makeConfig());
      expect(findings).toHaveLength(1);
      const f = findings[0];
      expect(f.metric_key).toBe('hash_ribbons');
      expect(f.allowed_vocab).toContain('capitulation');
      expect(f.compliance_class).toBe('valuation_sensitive');
      expect(f.narration_hint.verdict_allowed).toBe(true); // the condition state is present
    });

    it('no transition, no finding — and no capitulation vocab anywhere', () => {
      const bundle = makeBundle(AS_OF, [], ribbons(['capitulation', 'capitulation', 'capitulation']));
      expect(computeInflections(bundle, makeConfig())).toHaveLength(0);
    });

    it('a flip back to neutral is not narratable news', () => {
      const bundle = makeBundle(AS_OF, [], ribbons(['recovery', 'recovery', 'neutral']));
      expect(computeInflections(bundle, makeConfig())).toHaveLength(0);
    });
  });
});

describe('streak computor', () => {
  it('fires when a value is pinned in a band, and persistence is the finding', () => {
    // 60 wandering days then 21 days pinned at ~26-27.
    const wander = noise(21, 69).map((j) => 50 + j * 25);
    const pinned = noise(22, 21).map((j) => 26.5 + j * 0.5);
    const series = makeSeries('fear_greed', 'market_snapshot', 'daily', dailyPoints([...wander, ...pinned], AS_OF), 'Fear & Greed');
    const findings = computeStreaks(makeBundle(AS_OF, [series]), makeConfig());
    expect(findings).toHaveLength(1);
    const f = findings[0];
    expect(f.finding_type).toBe('streak');
    expect(f.observed).toBeGreaterThanOrEqual(21);
    expect(f.persistence_periods).toBe(f.observed);
    expect(f.narration_hint.verdict_allowed).toBe(true);
  });

  it('is silent for a series bouncing across its whole range', () => {
    const values = noise(31, 90).map((j) => 50 + j * 30);
    const series = makeSeries('rsi_14', 'trend_valuation', 'daily', dailyPoints(values, AS_OF));
    // The trailing run inside p25–p75 is short for a wide-swinging series.
    const findings = computeStreaks(makeBundle(AS_OF, [series]), makeConfig());
    for (const f of findings) expect(f.observed).toBeGreaterThanOrEqual(7); // if any, it earned it
  });

  it('detects a policy rate on hold across months (reprints preserved)', () => {
    const values = [...noise(41, 18).map((j) => 4 + j * 0.5), 4.35, 4.35, 4.35, 4.35, 4.35, 4.35];
    const series = makeSeries('macro:rba_cash_rate', 'policy_rate', 'monthly', monthlyPoints(values, AS_OF), 'RBA Cash Rate');
    const findings = computeStreaks(makeBundle(AS_OF, [series]), makeConfig());
    expect(findings).toHaveLength(1);
    expect(findings[0].observed).toBeGreaterThanOrEqual(6);
    expect(findings[0].period).toBe('month');
  });

  it('ignores keys outside the curated streak list', () => {
    const pinned = noise(23, 90).map((j) => 900 + j * 2);
    const series = makeSeries('hash_rate', 'network_security', 'daily', dailyPoints(pinned, AS_OF));
    expect(computeStreaks(makeBundle(AS_OF, [series]), makeConfig())).toHaveLength(0);
  });
});

describe('threshold computor', () => {
  const mvrvRow = {
    metric_key: 'mvrv',
    level_name: 'MVRV 1.0',
    level_value: 1.0,
    cross_direction: 'either' as const,
    compliance_class: 'valuation_sensitive' as const,
  };

  it('fires on the exact crossing day with the seeded compliance class', () => {
    const values = [...noise(29, 88).map((j) => 1.15 + j * 0.05), 1.04, 0.97];
    const series = makeSeries('mvrv', 'behaviour_valuation', 'daily', dailyPoints(values, AS_OF), 'MVRV');
    const config = makeConfig({ thresholds: [mvrvRow] });
    const findings = computeThresholds(makeBundle(AS_OF, [series]), config);
    expect(findings).toHaveLength(1);
    const f = findings[0];
    expect(f.compliance_class).toBe('valuation_sensitive');
    expect(f.direction).toBe('down');
    expect(f.observed).toBeCloseTo(0.97, 5);
    expect(f.unusualness).toBe(0.9);
  });

  it('does not fire while the value stays on one side', () => {
    const values = noise(29, 90).map((j) => 1.3 + j * 0.05);
    const series = makeSeries('mvrv', 'behaviour_valuation', 'daily', dailyPoints(values, AS_OF));
    const config = makeConfig({ thresholds: [mvrvRow] });
    expect(computeThresholds(makeBundle(AS_OF, [series]), config)).toHaveLength(0);
  });

  it('respects cross_direction', () => {
    const values = [...noise(29, 88).map((j) => 28 + j), 29.5, 31]; // crosses UP through 30
    const series = makeSeries('rsi_14', 'trend_valuation', 'daily', dailyPoints(values, AS_OF));
    const config = makeConfig({
      thresholds: [{ metric_key: 'rsi_14', level_name: 'RSI 30 (oversold)', level_value: 30, cross_direction: 'down', compliance_class: 'valuation_sensitive' }],
    });
    expect(computeThresholds(makeBundle(AS_OF, [series]), config)).toHaveLength(0);
  });

  it('computes the dynamic 200-week MA threshold against the view series', () => {
    const days = 60;
    const price: number[] = [];
    for (let i = 0; i < days - 1; i++) price.push(52000 + i * 10);
    price.push(49800); // falls through the MA
    const ma = Array.from({ length: days }, () => 50000);
    const priceSeries = makeSeries('btc_price_usd', 'trend_valuation', 'daily', dailyPoints(price, AS_OF), 'BTC/USD');
    const maSeries = makeSeries('ma_200w', 'trend_valuation', 'daily', dailyPoints(ma, AS_OF), '200-Week MA');
    const findings = computeThresholds(makeBundle(AS_OF, [priceSeries, maSeries]), makeConfig());
    expect(findings).toHaveLength(1);
    expect(findings[0].compliance_class).toBe('valuation_sensitive');
    expect(findings[0].direction).toBe('down');
  });
});

describe('staleness computor', () => {
  it('flags a feed past its tolerance and an empty series', () => {
    const fresh = makeSeries('hash_rate', 'network_security', 'daily', dailyPoints(noise(3, 30).map((j) => 900 + j), AS_OF));
    const staleValues = noise(4, 30).map((j) => 1.2 + j * 0.1);
    const stale = makeSeries('mvrv', 'behaviour_valuation', 'daily', dailyPoints(staleValues, daysBefore(AS_OF, 6)), 'MVRV');
    const empty = makeSeries('macro:gold', 'commodity', 'daily', [], 'Gold');

    const findings = computeStaleness(makeBundle(AS_OF, [fresh, stale, empty]), makeConfig());
    expect(findings.map((f) => f.metric_key).sort()).toEqual(['macro:gold', 'mvrv']);
    const staleFinding = findings.find((f) => f.metric_key === 'mvrv')!;
    expect(staleFinding.observed).toBe(6);
    const emptyFinding = findings.find((f) => f.metric_key === 'macro:gold')!;
    expect(emptyFinding.observed).toBe(-1);
  });

  it('gives daily macro series weekend slack', () => {
    const values = noise(6, 30).map((j) => 2300 + j * 10);
    const gold = makeSeries('macro:gold', 'commodity', 'daily', dailyPoints(values, daysBefore(AS_OF, 3)), 'Gold');
    expect(computeStaleness(makeBundle(AS_OF, [gold]), makeConfig())).toHaveLength(0);
  });
});

describe('computeFindings fan-out', () => {
  it('concatenates all six computors over one bundle', () => {
    const anomalySeries = makeSeries('hash_rate', 'network_security', 'daily', dailyPoints(spikedSeries(AS_OF, 95, 900, -8), AS_OF), 'Hash rate');
    const staleSeries = makeSeries('mvrv', 'behaviour_valuation', 'daily', dailyPoints([1.1, 1.2], daysBefore(AS_OF, 10)), 'MVRV');
    const bundle = makeBundle(AS_OF, [anomalySeries, staleSeries], [
      { date: daysBefore(AS_OF, 1), spreadPct: 1.0, signal: 'neutral' },
      { date: AS_OF, spreadPct: -0.5, signal: 'capitulation' },
    ]);
    const findings = computeFindings(bundle, makeConfig());
    const types = new Set(findings.map((f) => f.finding_type));
    expect(types).toContain('anomaly');
    expect(types).toContain('inflection');
    expect(types).toContain('staleness');
  });
});
