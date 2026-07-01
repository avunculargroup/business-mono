/**
 * RBA adapter — the fiddly one. No API; we fetch a statistical-table CSV and parse it.
 *
 * GET https://www.rba.gov.au/statistics/tables/csv/{table}-data.csv
 * where {table} derives from providerTableRef (e.g. 'f1.1', 'd3').
 *
 * The CSV is a multi-row metadata preamble (Title, Description, Frequency, Units,
 * Source, Publication date, Series ID) THEN data rows. Row 0 is NOT the header.
 * The data section is wide (D3 carries M1, M3, Broad money, Money base side by
 * side), so the adapter selects the target column by matching the Series ID /
 * header LABEL, never a hard-coded index — RBA occasionally reorders columns
 * between revisions and label-matching survives that.
 *
 * providerTableRef may carry an explicit column matcher after a colon, e.g.
 * 'D3:Broad money' or 'F1.1:FIRMMCRTD'. Without one, a sensible default per table
 * is used (see DEFAULT_COLUMN). CONFIRM both the table file and the exact column
 * label/Series ID against the live CSV before trusting real output.
 *
 * See docs/features/economic-indicators/adapter-contract.md.
 */

import type {
  AdapterResult,
  FetchOptions,
  IndicatorConfig,
  ProviderAdapter,
  RawObservation,
} from '../types.js';
import { parseRbaDateToFirstOfMonth } from '../period.js';

// Best-guess defaults — CONFIRM against the live CSV at build (see seed notes).
const DEFAULT_COLUMN: Record<string, string> = {
  'f1.1': 'FIRMMCRT', // Cash Rate Target series ID (confirmed against live F1.1 CSV)
  // D3 carries TWO broad-money columns — "Broad money" (Original, DMABMN) and
  // "Broad money: Seasonally adjusted" (DMABMS). The label "Broad money" is a
  // substring of both and matches the Original first; target the SA Series ID
  // directly, which the seed intends. (Confirmed against live D3 CSV.)
  d3: 'DMABMS',
};

/** Split "{table}:{columnMatch}" → its parts. Table is lower-cased for the URL. */
export function parseTableRef(ref: string): { table: string; columnMatch: string | null } {
  const [tableRaw, ...rest] = ref.split(':');
  const table = tableRaw.trim().toLowerCase();
  const columnMatch = rest.length ? rest.join(':').trim() : (DEFAULT_COLUMN[table] ?? null);
  return { table, columnMatch };
}

/** Minimal RFC4180 CSV parser — RBA descriptions contain commas, so a naive
 *  split on ',' is wrong. Returns rows of string cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += c; }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const DATE_CELL = /^\d{1,2}-[A-Za-z]{3}-\d{4}$/;

/** Pure parse step — exported for fixture tests (no network). */
export function parseRbaCsv(text: string, columnMatch: string | null): AdapterResult {
  if (!columnMatch) {
    return { ok: false, error: { kind: 'not_found', message: 'No column matcher for RBA table (set providerTableRef to "{table}:{column}")' } };
  }
  const rows = parseCsv(text);

  // Locate the metadata rows we match column labels against: the "Series ID" row
  // (mnemonics) plus the Title/Description rows (human labels).
  const labelRows = rows.filter((r) => {
    const head = (r[0] ?? '').trim().toLowerCase();
    return head === 'series id' || head === 'title' || head === 'description';
  });
  if (labelRows.length === 0) {
    return { ok: false, error: { kind: 'parse', message: 'RBA CSV: could not locate metadata/header rows' } };
  }

  // Find the target column index by matching any label row, case-insensitively.
  const needle = columnMatch.toLowerCase();
  let col = -1;
  for (const r of labelRows) {
    for (let j = 1; j < r.length; j++) {
      if ((r[j] ?? '').trim().toLowerCase().includes(needle)) { col = j; break; }
    }
    if (col !== -1) break;
  }
  if (col === -1) {
    return { ok: false, error: { kind: 'parse', message: `RBA CSV: column "${columnMatch}" not found` } };
  }

  const out: RawObservation[] = [];
  for (const r of rows) {
    const dateCell = (r[0] ?? '').trim();
    if (!DATE_CELL.test(dateCell)) continue; // skip preamble / blank rows
    const cell = (r[col] ?? '').trim();
    if (cell === '') continue; // no observation for this period — skip, don't zero
    const value = Number.parseFloat(cell);
    if (Number.isNaN(value)) {
      return { ok: false, error: { kind: 'parse', message: `RBA CSV: non-numeric value "${cell}" at ${dateCell}` } };
    }
    const periodDate = parseRbaDateToFirstOfMonth(dateCell);
    if (!periodDate) {
      return { ok: false, error: { kind: 'parse', message: `RBA CSV: unparseable date "${dateCell}"` } };
    }
    out.push({ periodDate, value, releasedAt: null, raw: { date: dateCell, value: cell, column: columnMatch } });
  }

  // Unlike FRED (a windowed server-side fetch, where [] legitimately means "no
  // new print"), this parses the FULL historical CSV every call. A matched
  // column with zero non-blank rows across all of history is never a genuine
  // no-op — it means the column match landed on the wrong place (header
  // layout changed, series discontinued, etc). Surface it as a failure so it
  // shows up in agent_activity instead of silently vanishing as a "success".
  if (out.length === 0) {
    return {
      ok: false,
      error: {
        kind: 'parse',
        message: `RBA CSV: column "${columnMatch}" matched a header but every data row was blank — column layout or series may have changed`,
      },
    };
  }

  out.sort((a, b) => a.periodDate.localeCompare(b.periodDate));
  return { ok: true, observations: out };
}

export const rbaAdapter: ProviderAdapter = {
  provider: 'rba',

  async fetchLatest(indicator: IndicatorConfig, opts?: FetchOptions): Promise<AdapterResult> {
    if (!indicator.providerTableRef) {
      return { ok: false, error: { kind: 'not_found', message: `Indicator ${indicator.shortLabel} has no providerTableRef` } };
    }
    const { table, columnMatch } = parseTableRef(indicator.providerTableRef);
    const url = `https://www.rba.gov.au/statistics/tables/csv/${table}-data.csv`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': 'BTS-platform/1.0 (economic-indicators)' },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      return { ok: false, error: { kind: 'transport', message: err instanceof Error ? err.message : String(err) } };
    }
    if (!res.ok) {
      const kind = res.status === 429 ? 'rate_limit' : res.status === 404 ? 'not_found' : 'transport';
      return { ok: false, error: { kind, message: `RBA HTTP ${res.status}`, status: res.status } };
    }

    const text = await res.text();
    const result = parseRbaCsv(text, columnMatch);
    // Apply backfill/limit: keep the most recent N (parse returns oldest→newest).
    if (result.ok && opts?.limit && result.observations.length > opts.limit) {
      return { ok: true, observations: result.observations.slice(-opts.limit) };
    }
    return result;
  },
};
