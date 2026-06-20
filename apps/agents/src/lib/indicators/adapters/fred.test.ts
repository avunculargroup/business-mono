import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseFredResponse } from './fred.js';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8'));
}

describe('parseFredResponse', () => {
  it('parses a real series, skipping the unpublished "." row, oldest→newest', () => {
    const res = parseFredResponse(fixture('fred-m2sl.json'));
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // The "." (2026-06) row is skipped; the three real values remain.
    expect(res.observations).toHaveLength(3);
    expect(res.observations.map((o) => o.periodDate)).toEqual([
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
    ]);
    const latest = res.observations[2];
    expect(latest.value).toBe(21399.0);
    expect(latest.releasedAt).toBeNull(); // v1: provider release date deferred
    expect(latest.raw).toMatchObject({ date: '2026-05-01', value: '21399.0' });
  });

  it('returns a parse error (not NaN, not a throw) on a non-numeric value', () => {
    const res = parseFredResponse(fixture('fred-malformed.json'));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
  });

  it('returns a parse error when the observations array is missing', () => {
    const res = parseFredResponse({});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
  });
});
