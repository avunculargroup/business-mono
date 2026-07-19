import { describe, it, expect } from 'vitest';
import { extractSalientNumbers, payloadNumbers, runHouseStyle, summariseViolations } from './houseStyleLinter.js';
import { buildFinding } from '../../../test/factories.js';

const FINDINGS = [
  buildFinding(), // observed -8, baseline {0.1, 1.2, -2.1, 0.1, 2.2}, persistence 1
  buildFinding({
    id: 'streak:fear_greed:2026-07-18',
    finding_type: 'streak',
    metric_key: 'fear_greed',
    metric_group: 'market_snapshot',
    observed: 21,
    persistence_periods: 21,
    narration_hint: { means: 'Fear & Greed has held between 25.0 and 28.5 for 21 days', verdict_allowed: true },
  }),
];

describe('extractSalientNumbers', () => {
  it('parses percentages and decimals, including en-AU forms', () => {
    expect(extractSalientNumbers('fell 8% then −2.2%, closing at 1,234.5')).toEqual([8, -2.2, 1234.5]);
  });

  it('exempts bare integers (dates, period counts)', () => {
    expect(extractSalientNumbers('held for 21 days since 14 July')).toEqual([]);
  });

  it('handles the typographic minus', () => {
    expect(extractSalientNumbers('tracking −8 %')).toEqual([-8]);
  });
});

describe('payloadNumbers', () => {
  it('collects payload fields and hint-embedded figures', () => {
    const nums = payloadNumbers(FINDINGS);
    expect(nums).toContain(-8);
    expect(nums).toContain(2.2); // baseline p95
    expect(nums).toContain(25); // from the hint string "25.0"
    expect(nums).toContain(28.5);
  });
});

describe('runHouseStyle', () => {
  it('passes clean copy that cites only payload figures', () => {
    const text =
      'Hash rate fell 8% overnight, outside its normal daily band. ' +
      'Fear & Greed has held between 25.0 and 28.5 for three weeks; the persistence is the story.';
    const result = runHouseStyle(text, FINDINGS);
    expect(result.pass).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('hard-fails an exclamation mark', () => {
    const result = runHouseStyle('Hash rate fell 8%!', FINDINGS);
    expect(result.pass).toBe(false);
    expect(result.violations[0].rule).toBe('no_exclamation');
  });

  it('hard-fails Americanisms but allows -ize allowlist words', () => {
    const bad = runHouseStyle('We analyze the color of the trend.', FINDINGS);
    expect(bad.pass).toBe(false);
    expect(bad.violations.map((v) => v.rule)).toContain('australian_english');

    const ok = runHouseStyle('The size of the move fell 8% against its band.', FINDINGS);
    expect(ok.pass).toBe(true);
  });

  it('hard-fails a figure that traces to no finding payload value', () => {
    const result = runHouseStyle('Hash rate fell 42.7% overnight.', FINDINGS);
    expect(result.pass).toBe(false);
    expect(result.violations[0].rule).toBe('payload_only_numbers');
    expect(result.violations[0].detail).toContain('42.7');
  });

  it('accepts magnitude restatements of signed payload values', () => {
    // observed is -8; "fell 8%" is the same claim.
    expect(runHouseStyle('It fell 8% on the day.', FINDINGS).pass).toBe(true);
  });

  it('warns (not fails) on bitcoin capitalisation heuristics', () => {
    const result = runHouseStyle('the bitcoin network processed more transactions', FINDINGS);
    expect(result.pass).toBe(true);
    expect(result.violations[0]).toMatchObject({ rule: 'bitcoin_capitalisation', severity: 'warn' });
  });

  it('flags mid-sentence "Bitcoin" before a movement as likely the unit', () => {
    const result = runHouseStyle('Overnight, Bitcoin fell 8% against its band.', FINDINGS);
    expect(result.pass).toBe(true);
    expect(result.violations.some((v) => v.rule === 'bitcoin_capitalisation')).toBe(true);
    // Sentence-initial "Bitcoin" is correct regardless of sense — not flagged.
    const clean = runHouseStyle('Bitcoin fell 8% against its band.', FINDINGS);
    expect(clean.violations).toHaveLength(0);
  });
});

describe('summariseViolations', () => {
  it('renders one line per violation for the corrective prompt', () => {
    const { violations } = runHouseStyle('We analyze this!', FINDINGS);
    const summary = summariseViolations(violations);
    expect(summary).toContain('[hard] no_exclamation');
    expect(summary).toContain('[hard] australian_english');
  });
});
