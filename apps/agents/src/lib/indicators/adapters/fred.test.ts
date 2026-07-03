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

  it('defaults monthly — collapses daily dates to first-of-month', () => {
    const res = parseFredResponse({
      observations: [
        { date: '2026-06-15', value: '100.0' },
        { date: '2026-06-16', value: '101.0' },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Both days collapse onto one period — exactly why daily series need granularity.
    expect(res.observations.map((o) => o.periodDate)).toEqual(['2026-06-01', '2026-06-01']);
  });

  it('keeps the actual day for daily granularity', () => {
    const res = parseFredResponse(
      {
        observations: [
          { date: '2026-06-15', value: '100.0' },
          { date: '2026-06-16', value: '101.0' },
          { date: '2026-06-17', value: '.' }, // unpublished — still skipped
        ],
      },
      'daily',
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations.map((o) => o.periodDate)).toEqual(['2026-06-15', '2026-06-16']);
    expect(res.observations[1].value).toBe(101.0);
  });
});
