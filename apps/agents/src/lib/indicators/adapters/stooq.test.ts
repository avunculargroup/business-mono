import { describe, it, expect } from 'vitest';
import { parseStooqCsv } from './stooq.js';

const CSV = [
  'Date,Open,High,Low,Close,Volume',
  '2026-07-15,3350.10,3372.40,3340.00,3361.55,0',
  '2026-07-16,3361.55,3380.20,3355.10,3375.90,0',
  '2026-07-17,3375.90,3390.00,3360.00,3382.25,0',
].join('\n');

describe('parseStooqCsv', () => {
  it('parses a daily CSV, taking Close, keeping the actual day, oldest→newest', () => {
    const res = parseStooqCsv(CSV);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations.map((o) => o.periodDate)).toEqual([
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
    ]);
    const latest = res.observations[2];
    expect(latest.value).toBe(3382.25);
    expect(latest.releasedAt).toBeNull();
    expect(latest.raw).toMatchObject({ date: '2026-07-17', close: '3382.25' });
  });

  it('locates Close by header label, not a fixed column index', () => {
    // Columns reordered — the parser must still pick the Close value.
    const reordered = ['Close,Date', '3361.55,2026-07-16'].join('\n');
    const res = parseStooqCsv(reordered);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations).toHaveLength(1);
    expect(res.observations[0].value).toBe(3361.55);
    expect(res.observations[0].periodDate).toBe('2026-07-16');
  });

  it('reports a rate_limit error for the Stooq daily-hits-limit body', () => {
    const res = parseStooqCsv('Exceeded the daily hits limit, please try again in 24 hours.');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('rate_limit');
  });

  it('fails (not a silent no-op) when the header is present but there are no data rows', () => {
    const res = parseStooqCsv('Date,Open,High,Low,Close,Volume\n');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
  });

  it('returns a parse error (not NaN, not a throw) on a non-numeric close', () => {
    const res = parseStooqCsv('Date,Close\n2026-07-17,N/D');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
  });

  it('errors when the Close column is missing entirely', () => {
    const res = parseStooqCsv('Date,Open,High,Low\n2026-07-17,1,2,0.5');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
  });
});
