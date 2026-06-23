import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseHashrate,
  parseDifficultyAdjustment,
  parsePools,
  parseRewardStats,
} from './mempool.js';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8'));
}

describe('parseHashrate', () => {
  it('normalises hash rate to EH/s (~640, NOT 6.4e20) — the critical normalisation', () => {
    const res = parseHashrate(fixture('mempool-hashrate.json'), {
      backfillDays: 90,
      wantHashRate: true,
      wantDifficulty: false,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.observations).toHaveLength(3); // one per day, oldest→newest
    for (const o of res.observations) {
      expect(o.key).toBe('hash_rate');
      expect(o.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/); // UTC calendar date
      expect(o.value).toBeGreaterThan(600);
      expect(o.value).toBeLessThan(700); // EH/s scale, not raw H/s
    }
    expect(res.observations[2].value).toBeCloseTo(642, 0);
  });

  it('steady run (no backfill) emits only the latest couple of days', () => {
    const res = parseHashrate(fixture('mempool-hashrate.json'), {
      wantHashRate: true,
      wantDifficulty: false,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations).toHaveLength(2);
  });

  it('emits difficulty (raw input) from currentDifficulty', () => {
    const res = parseHashrate(fixture('mempool-hashrate.json'), {
      wantHashRate: false,
      wantDifficulty: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations).toHaveLength(1);
    expect(res.observations[0]).toMatchObject({ key: 'difficulty', value: 121000000000000 });
  });

  it('returns a parse error (not a throw) when the hashrates series is missing', () => {
    const res = parseHashrate({}, { wantHashRate: true, wantDifficulty: false });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
  });

  it('does not lose precision on an overflow-sized hash rate', () => {
    // A raw H/s value far above Number.MAX_SAFE_INTEGER must still divide cleanly.
    const res = parseHashrate(
      { hashrates: [{ timestamp: 1750377600, avgHashrate: 9.99e20 }] },
      { wantHashRate: true, wantDifficulty: false },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations[0].value).toBeCloseTo(999, 0);
  });
});

describe('parseDifficultyAdjustment', () => {
  it('maps difficultyChange to next_difficulty_adjustment and preserves the ETA in raw', () => {
    const res = parseDifficultyAdjustment(fixture('mempool-difficulty-adjustment.json'));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations).toHaveLength(1);
    expect(res.observations[0]).toMatchObject({ key: 'next_difficulty_adjustment', value: 2.43 });
    expect(res.observations[0].raw).toMatchObject({ estimatedRetargetDate: 1750800000000 });
  });

  it('parse error when difficultyChange is absent', () => {
    const res = parseDifficultyAdjustment({});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
  });
});

describe('parsePools', () => {
  it('emits the top pool share as a percent, including the Unknown bucket in the field', () => {
    const res = parsePools(fixture('mempool-pools.json'));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations[0]).toMatchObject({ key: 'pool_concentration_top' });
    expect(res.observations[0].value).toBeCloseTo(28.7, 1);
  });

  it('falls back to blockCount/total when no share field is present', () => {
    const res = parsePools({ pools: [{ name: 'A', blockCount: 60 }, { name: 'B', blockCount: 40 }] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations[0].value).toBeCloseTo(60, 5);
  });

  it('parse error when there is no usable pool data', () => {
    const res = parsePools({ pools: [] });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
  });
});

describe('parseRewardStats', () => {
  it('converts sats to BTC for both revenue and fees', () => {
    const res = parseRewardStats(fixture('mempool-reward-stats.json'), { wantRevenue: true, wantFees: true });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const byKey = Object.fromEntries(res.observations.map((o) => [o.key, o.value]));
    expect(byKey['miner_revenue_total']).toBeCloseTo(1625, 4); // 162500000000 sats ÷ 1e8
    expect(byKey['miner_fees_total']).toBeCloseTo(125, 4); //  12500000000 sats ÷ 1e8
  });

  it('parse error on a non-numeric reward', () => {
    const res = parseRewardStats({ totalReward: 'oops', totalFee: '1' }, { wantRevenue: true, wantFees: true });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
  });
});
