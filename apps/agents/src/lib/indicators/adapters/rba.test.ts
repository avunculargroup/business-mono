import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseRbaCsv, parseTableRef, parseCsv } from './rba.js';

function fixture(name: string): string {
  return readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');
}

describe('parseTableRef', () => {
  it('lower-cases the table and applies the default column when none is given', () => {
    expect(parseTableRef('D3')).toEqual({ table: 'd3', columnMatch: 'DMABMS' });
    expect(parseTableRef('F1.1')).toEqual({ table: 'f1.1', columnMatch: 'FIRMMCRT' });
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
  it('selects seasonally-adjusted Broad money by its DMABMS Series ID, skips blanks', () => {
    // The D3 default matcher. Feb's SA cell is blank → skipped; Jan + Mar remain,
    // normalised end-of-month → first-of-month.
    const res = parseRbaCsv(fixture('rba-d3.csv'), 'DMABMS');
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.observations.map((o) => o.periodDate)).toEqual(['2026-01-01', '2026-03-01']);
    expect(res.observations.map((o) => o.value)).toEqual([2890.7, 2912.8]);
    expect(res.observations[0].releasedAt).toBeNull();
  });

  it('label "Broad money" alone matches the Original column — why the default uses DMABMS', () => {
    // "Broad money" is a substring of both the Original and "Broad money:
    // Seasonally adjusted" titles; the Original column (DMABMN) comes first, so a
    // bare label match silently picks the non-SA series. This is the trap the
    // DMABMS default avoids.
    const res = parseRbaCsv(fixture('rba-d3.csv'), 'Broad money');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Original column has all three months populated (2885.0 / 2900.0 / 2908.0).
    expect(res.observations.map((o) => o.value)).toEqual([2885.0, 2900.0, 2908.0]);
  });

  it('matches a column by Series ID mnemonic too', () => {
    const res = parseRbaCsv(fixture('rba-d3.csv'), 'DMAM1N');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // M1 column has all three months populated.
    expect(res.observations.map((o) => o.value)).toEqual([420.5, 422.1, 425.1]);
  });

  it('selects the Cash Rate Target from real F1.1 by its FIRMMCRT Series ID', () => {
    // Regression: the seeded default was FIRMMCRTD (no such series) — the real
    // cash-rate-target mnemonic is FIRMMCRT. The neighbouring FIRMMCRI column
    // (interbank rate) must NOT be picked despite the shared FIRMMCR prefix.
    const res = parseRbaCsv(fixture('rba-f11.csv'), 'FIRMMCRT');
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // All three months populated, normalised to first-of-month. The values come
    // from the FIRMMCRT column (4.10/3.85/3.85), NOT FIRMMCRI (4.09/3.84/3.85).
    expect(res.observations.map((o) => o.periodDate)).toEqual([
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
    ]);
    expect(res.observations.map((o) => o.value)).toEqual([4.1, 3.85, 3.85]);
    expect(res.observations[0].releasedAt).toBeNull();
  });

  it('errors (no throw) when the requested column is absent', () => {
    const res = parseRbaCsv(fixture('rba-d3.csv'), 'Nonexistent Column');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
  });

  it('errors on a truncated CSV with no metadata/header rows', () => {
    const res = parseRbaCsv(fixture('rba-truncated.csv'), 'FIRMMCRT');
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

  it('errors (does not silently succeed) when the matched column is blank on every row', () => {
    // Money Base header exists but every data row is blank — e.g. a discontinued
    // series still listed in the preamble. This must not look like a genuine
    // "nothing new" no-op the way an empty FRED window would.
    const csv =
      '"Title","M1","Money Base"\n' +
      '"Series ID","DMAM1N","DMAMB"\n' +
      '"31-Jan-2026","420.5",""\n' +
      '"28-Feb-2026","422.1",""\n';
    const res = parseRbaCsv(csv, 'DMAMB');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
    expect(res.error.message).toMatch(/every data row was blank/);
  });
});
