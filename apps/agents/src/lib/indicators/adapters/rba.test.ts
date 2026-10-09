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

  it('tolerates the leading table-title line RBA prepends before the metadata preamble', () => {
    // Confirmed against a live fetch: row 0 of the real CSV is a bare title
    // line ('F1.1 INTEREST RATES AND YIELDS – MONEY MARKET'), not the "Title,"
    // metadata row. Both fixtures already carry this line — this test pins it.
    const res = parseRbaCsv(fixture('rba-f11.csv'), 'FIRMMCRT');
    expect(res.ok).toBe(true);
  });

  it('reads data-row dates in both RBA formats, and never the Publication date row', () => {
    // f1.1/d3 use DD/MM/YYYY; some daily tables use DD-Mon-YYYY. Accepting only
    // one of them once silently produced zero observations for every RBA indicator.
    const mixed =
      '"Title","Cash Rate Target"\n' +
      '"Publication date","01-Jun-2026"\n' +
      '"Series ID","FIRMMCRT"\n' +
      '"31-Mar-2026","4.10"\n' +
      '"30/04/2026","4.35"\n';
    const res = parseRbaCsv(mixed, 'FIRMMCRT');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations).toEqual([
      { periodDate: '2026-03-01', value: 4.1, releasedAt: null, raw: { date: '31-Mar-2026', value: '4.10', column: 'FIRMMCRT' } },
      { periodDate: '2026-04-01', value: 4.35, releasedAt: null, raw: { date: '30/04/2026', value: '4.35', column: 'FIRMMCRT' } },
    ]);
  });

  it('collapses a daily table to the LAST value of each month, not an average', () => {
    // Regression: F1.1's FIRMMCRT is the monthly average of the target, so the
    // 29 Sep 2026 hike to 4.60 (effective 30 Sep) was stored as 4.36. F1 is
    // daily; the month must take the target standing at its last row.
    const daily =
      '"Title","Cash Rate Target","Interbank Overnight Cash Rate"\n' +
      '"Series ID","FIRMMCRTD","FIRMMCRID"\n' +
      '"28/08/2026","4.35","4.35"\n' +
      '"29/09/2026","4.35","4.35"\n' +
      '"30/09/2026","4.60","4.59"\n' +
      '"01/10/2026","4.60","4.60"\n' +
      '"08/10/2026","4.60","4.61"\n';
    expect(parseTableRef('F1')).toEqual({ table: 'f1', columnMatch: 'FIRMMCRTD' });
    const res = parseRbaCsv(daily, 'FIRMMCRTD');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations.map((o) => [o.periodDate, o.value])).toEqual([
      ['2026-08-01', 4.35],
      ['2026-09-01', 4.6],
      ['2026-10-01', 4.6],
    ]);
    expect(res.observations[1].raw).toEqual({ date: '30/09/2026', value: '4.60', column: 'FIRMMCRTD' });
  });

  it('errors (does not silently succeed) when the matched column is blank on every row', () => {
    // Money Base header exists but every data row is blank — e.g. a discontinued
    // series still listed in the preamble. This must not look like a genuine
    // "nothing new" no-op the way an empty FRED window would.
    const csv =
      '"Title","M1","Money Base"\n' +
      '"Series ID","DMAM1N","DMAMB"\n' +
      '"31/01/2026","420.5",""\n' +
      '"28/02/2026","422.1",""\n';
    const res = parseRbaCsv(csv, 'DMAMB');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
    expect(res.error.message).toMatch(/every data row was blank/);
  });
});
