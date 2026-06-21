import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCoinMetricsResponse } from './coinmetrics.js';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8'));
}

const byCode = new Map<string, string>([
  ['CapMVRVCur', 'mvrv'],
  ['CapRealUSD', 'realised_cap'],
  ['SplyCur', 'supply'],
  ['AdrActCnt', 'active_addresses'],
]);

describe('parseCoinMetricsResponse', () => {
  it('maps each metric code to its registry key, oldest→newest, across days', () => {
    const res = parseCoinMetricsResponse(fixture('coinmetrics-batch.json'), byCode);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // 2 days × 4 metrics
    expect(res.observations).toHaveLength(8);

    const latestMvrv = res.observations.filter((o) => o.key === 'mvrv').at(-1);
    expect(latestMvrv).toMatchObject({ observedAt: '2026-06-20', value: 2.1 });

    const latestSupply = res.observations.filter((o) => o.key === 'supply').at(-1);
    expect(latestSupply?.value).toBe(19800000);
  });

  it('treats a missing/empty metric as absent for that key (NOT a zero)', () => {
    const payload = {
      data: [
        { asset: 'btc', time: '2026-06-20T00:00:00Z', CapMVRVCur: '2.10', CapRealUSD: '', SplyCur: '19800000' },
      ],
    };
    const res = parseCoinMetricsResponse(payload, byCode);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const keys = res.observations.map((o) => o.key);
    expect(keys).toContain('mvrv');
    expect(keys).toContain('supply');
    expect(keys).not.toContain('realised_cap'); // empty string → omitted, not 0
    expect(keys).not.toContain('active_addresses'); // missing field → omitted
  });

  it('parse error (not NaN, not a throw) on a non-numeric value', () => {
    const payload = { data: [{ asset: 'btc', time: '2026-06-20T00:00:00Z', CapMVRVCur: 'n/a' }] };
    const res = parseCoinMetricsResponse(payload, byCode);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
  });

  it('parse error when the data array is missing', () => {
    const res = parseCoinMetricsResponse({}, byCode);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
  });
});
