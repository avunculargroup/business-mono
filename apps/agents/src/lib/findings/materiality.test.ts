import { describe, it, expect } from 'vitest';
import { materialityOf, persistenceFactor, scoreAndSelect } from './materiality.js';
import { makeConfig } from './__fixtures__/series.js';
import { buildFinding } from '../../../test/factories.js';

const config = makeConfig();
const AS_OF = '2026-07-18';

describe('persistenceFactor — the anti-capitulation guard', () => {
  it("the spec's worked example: single-day anomaly in a noisy series scores 0.5", () => {
    const f = buildFinding(); // hash_rate anomaly, persistence 1, vol high
    expect(persistenceFactor(f, config)).toBe(0.5);
  });

  it('anomalies gain with persistence, capped at 1.0', () => {
    expect(persistenceFactor(buildFinding({ persistence_periods: 2 }), config)).toBeCloseTo(0.8, 5);
    expect(persistenceFactor(buildFinding({ persistence_periods: 9 }), config)).toBe(1.0);
  });

  it('low-vol series are not penalised for a single period', () => {
    const f = buildFinding({ metric_group: 'money_supply', persistence_periods: 1 });
    expect(persistenceFactor(f, config)).toBeCloseTo(0.7, 5);
  });

  it('streaks are rewarded for persistence', () => {
    const f = buildFinding({ finding_type: 'streak', persistence_periods: 21 });
    expect(persistenceFactor(f, config)).toBe(1.0);
    expect(persistenceFactor(buildFinding({ finding_type: 'streak', persistence_periods: 1 }), config)).toBeCloseTo(0.58, 5);
  });

  it('a confirmed break/crossing is meaningful on day one', () => {
    expect(persistenceFactor(buildFinding({ finding_type: 'threshold', persistence_periods: 1 }), config)).toBeCloseTo(0.85, 5);
    expect(persistenceFactor(buildFinding({ finding_type: 'divergence', persistence_periods: 1 }), config)).toBeCloseTo(0.85, 5);
  });
});

describe('materialityOf', () => {
  it('is multiplicative — weak on one axis collapses the score', () => {
    const strong = buildFinding({ persistence_periods: 3 });
    const weakUnusualness = buildFinding({ persistence_periods: 3, unusualness: 0.1 });
    expect(materialityOf(strong, config, [])).toBeGreaterThan(0.5);
    expect(materialityOf(weakUnusualness, config, [])).toBeLessThan(0.12);
  });

  it('the worked example survives as a watch, not a headline', () => {
    // 0.96 * (0.6 + 0.4*0.8) * 0.5 * 1.1 ≈ 0.486 — above floor, below a
    // persistent finding's score.
    const f = buildFinding();
    const score = materialityOf(f, config, []);
    expect(score).toBeGreaterThan(0.35);
    expect(score).toBeLessThan(0.55);
  });

  it('applies group watch boosts', () => {
    const f = buildFinding();
    const boosted = materialityOf(f, config, [
      { target_type: 'metric_group', target_ref: 'network_security', boost: 1.5 },
    ]);
    expect(boosted).toBeCloseTo(Math.min(1, materialityOf(f, config, []) * 1.5), 5);
  });

  it('applies pair watch boosts only to the matching divergence', () => {
    const divergence = buildFinding({
      finding_type: 'divergence',
      metric_key: 'btc_price_usd',
      metric_group: 'trend_valuation',
      secondary_metric_key: 'macro:us_m2',
      unusualness: 0.5,
      magnitude_norm: 0.4,
    });
    const watches = [{ target_type: 'pair' as const, target_ref: 'btc_price_usd|macro:us_m2', boost: 1.5 }];
    expect(materialityOf(divergence, config, watches)).toBeCloseTo(
      materialityOf(divergence, config, []) * 1.5,
      5,
    );
    // A different finding is untouched.
    const other = buildFinding();
    expect(materialityOf(other, config, watches)).toBe(materialityOf(other, config, []));
  });

  it('unknown metric_group falls back to thesis weight 1 / low vol', () => {
    const f = buildFinding({ metric_group: 'mystery_group', persistence_periods: 1 });
    expect(materialityOf(f, config, [])).toBeGreaterThan(0);
  });
});

describe('scoreAndSelect', () => {
  it('ranks, floors, caps at K, and strips staleness to ops', () => {
    const findings = [
      buildFinding({ id: 'a', persistence_periods: 3, unusualness: 0.95 }),
      buildFinding({ id: 'b', finding_type: 'threshold', metric_key: 'mvrv', metric_group: 'behaviour_valuation', unusualness: 0.9, magnitude_norm: 0.5, compliance_class: 'valuation_sensitive' }),
      buildFinding({ id: 'c', finding_type: 'streak', metric_key: 'fear_greed', metric_group: 'market_snapshot', persistence_periods: 21, unusualness: 1, magnitude_norm: 0.9 }),
      buildFinding({ id: 'd', unusualness: 0.05, magnitude_norm: 0.1 }), // noise — below floor
      buildFinding({ id: 'e', finding_type: 'staleness', metric_key: 'macro:gold' }),
      buildFinding({ id: 'f', finding_type: 'divergence', metric_key: 'btc_price_usd', secondary_metric_key: 'macro:us_m2', metric_group: 'trend_valuation', unusualness: 0.97, magnitude_norm: 0.8, persistence_periods: 2 }),
    ];
    const selection = scoreAndSelect(findings, config, [], AS_OF);

    expect(selection.as_of).toBe(AS_OF);
    expect(selection.report_mode).toBe('normal');
    expect(selection.findings).toHaveLength(3); // K = 3, even though 4 clear the floor
    expect(selection.findings.map((f) => f.id)).not.toContain('d');
    expect(selection.findings.map((f) => f.id)).not.toContain('e');
    // Sorted by materiality desc.
    const scores = selection.findings.map((f) => f.materiality);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(selection.ops_findings.map((f) => f.id)).toEqual(['e']);
  });

  it('quiet day: nothing clears the floor → single best finding, quiet mode', () => {
    const findings = [
      buildFinding({ id: 'weak-1', unusualness: 0.3, magnitude_norm: 0.2 }),
      buildFinding({ id: 'weak-2', unusualness: 0.2, magnitude_norm: 0.1 }),
      buildFinding({ id: 'stale', finding_type: 'staleness' }),
    ];
    const selection = scoreAndSelect(findings, config, [], AS_OF);
    expect(selection.report_mode).toBe('quiet');
    expect(selection.findings).toHaveLength(1);
    expect(selection.findings[0].id).toBe('weak-1');
    expect(selection.ops_findings).toHaveLength(1);
  });

  it('an empty findings list is a quiet day with nothing to note', () => {
    const selection = scoreAndSelect([], config, [], AS_OF);
    expect(selection.report_mode).toBe('quiet');
    expect(selection.findings).toHaveLength(0);
  });

  it('selected findings carry their computed materiality', () => {
    const selection = scoreAndSelect([buildFinding({ persistence_periods: 3 })], config, [], AS_OF);
    expect(selection.findings[0].materiality).toBeGreaterThan(0.35);
  });
});
