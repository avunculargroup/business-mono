import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseRbaCsv, parseTableRef, parseCsv } from './rba.js';

function fixture(name: string): string {
  return readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');
}

describe('parseTableRef', () => {
  it('lower-cases the table and applies the default column when none is given', () => {
    expect(parseTableRef('D3')).toEqual({ table: 'd3', columnMatch: 'Broad money' });
    expect(parseTableRef('F1.1')).toEqual({ table: 'f1.1', columnMatch: 'FIRMMCRTD' });
  });
  it('honours an explicit "table:column" matcher', () => {
    expect(parseTableRef('D3:Money Base')).toEqual({ table: 'd3', columnMatch: 'Money Base' });
  });
});

describe('parseCsv', () => {
  it('keeps commas inside quoted fields', () => {
    const rows = parseCsv('"Description","Broad money, seasonally adjusted","x"\n');
    expect(rows[0]).toEqual(['Description', 'Broad money, seasonally adjusted', 'x']);
  });
});

describe('parseRbaCsv', () => {
  it('selects the target column by label, normalises end-of-month dates, skips blanks', () => {
    const res = parseRbaCsv(fixture('rba-d3.csv'), 'Broad money');
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Feb's Broad-money cell is blank → skipped; Jan + Mar remain, first-of-month.
    expect(res.observations.map((o) => o.periodDate)).toEqual(['2026-01-01', '2026-03-01']);
    expect(res.observations.map((o) => o.value)).toEqual([2890.7, 2912.8]);
    expect(res.observations[0].releasedAt).toBeNull();
  });

  it('matches a column by Series ID mnemonic too', () => {
    const res = parseRbaCsv(fixture('rba-d3.csv'), 'DMAM1N');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // M1 column has all three months populated.
    expect(res.observations.map((o) => o.value)).toEqual([420.5, 422.1, 425.1]);
  });

  it('errors (no throw) when the requested column is absent', () => {
    const res = parseRbaCsv(fixture('rba-d3.csv'), 'Nonexistent Column');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
  });

  it('errors on a truncated CSV with no metadata/header rows', () => {
    const res = parseRbaCsv(fixture('rba-truncated.csv'), 'FIRMMCRTD');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
  });

  it('errors when given no column matcher', () => {
    const res = parseRbaCsv(fixture('rba-d3.csv'), null);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('not_found');
  });
});
