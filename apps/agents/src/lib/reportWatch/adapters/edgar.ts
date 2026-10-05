// SEC EDGAR discovery — one filer's recent filings, from its submissions index.
//
// Reads https://data.sec.gov/submissions/CIK##########.json, the index EDGAR
// publishes per filer, rather than the Atom browse feed: the index carries the
// form type, the 8-K item numbers and the primary document's file name, which
// is everything registration needs. The feed links an index page and states no
// items, so filtering at the source (spec: "Filter at the source, not after")
// would mean fetching every 8-K Strategy files to find the few about treasury.
//
// Only used on a source bound to a research company. What it finds is
// registered in research_documents, never acquired for the news feed.

import type { EdgarDetectionConfig } from '@platform/shared';
import type {
  DiscoveredCandidate,
  ReportAdapterInput,
  ReportAdapterResult,
  ReportDiscoveryAdapter,
} from '../types.js';
import { configError } from '../types.js';
import { fetchText, REPORT_USER_AGENT } from '../http.js';

/**
 * The SEC's fair-access policy asks automated clients for a contact email in
 * the user agent, and data.sec.gov refuses requests without one.
 */
export const EDGAR_USER_AGENT = `${REPORT_USER_AGENT.replace(/\)$/, '')}; hq@btreasury.com.au)`;

const DEFAULT_FORMS = ['8-K', '8-K/A', '10-Q', '10-Q/A', '10-K', '10-K/A', '6-K', '20-F', '40-F'];
const DEFAULT_ITEMS_8K = ['1.01', '2.02', '7.01', '8.01'];
const DEFAULT_LOOKBACK_DAYS = 90;

/** The parallel arrays EDGAR's `filings.recent` block carries. */
interface RecentFilings {
  accessionNumber: string[];
  filingDate: string[];
  reportDate?: string[];
  form: string[];
  items?: string[];
  primaryDocument: string[];
  primaryDocDescription?: string[];
}

export function submissionsUrl(cik: string): string {
  return `https://data.sec.gov/submissions/CIK${cik.padStart(10, '0')}.json`;
}

/** The primary document of a filing, at the address the hand-entered rows use. */
export function archiveUrl(cik: string, accession: string, primaryDocument: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, '')}/${primaryDocument}`;
}

function daysBefore(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Pure: the submissions index in, the filings worth registering out.
 *
 * An 8-K (or 8-K/A) is kept only when it states at least one wanted item. A
 * filing with no primary document cannot be fetched, so it is not offered.
 */
export function parseSubmissions(
  body: unknown,
  config: EdgarDetectionConfig,
  now: Date,
): DiscoveredCandidate[] | null {
  const root = body as { name?: string; filings?: { recent?: RecentFilings } } | null;
  const recent = root?.filings?.recent;
  if (!recent || !Array.isArray(recent.accessionNumber) || !Array.isArray(recent.form)) return null;

  const forms = new Set((config.forms?.length ? config.forms : DEFAULT_FORMS).map((f) => f.toUpperCase()));
  const items = new Set(config.items_8k?.length ? config.items_8k : DEFAULT_ITEMS_8K);
  const since = config.since ?? daysBefore(now, DEFAULT_LOOKBACK_DAYS);

  const out: DiscoveredCandidate[] = [];
  for (const [index, accession] of recent.accessionNumber.entries()) {
    const form = (recent.form[index] ?? '').toUpperCase();
    const filingDate = recent.filingDate[index] ?? '';
    const primaryDocument = recent.primaryDocument[index] ?? '';
    if (!forms.has(form) || !primaryDocument || filingDate < since) continue;

    const stated = (recent.items?.[index] ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (form.startsWith('8-K') && !stated.some((item) => items.has(item))) continue;

    const description = recent.primaryDocDescription?.[index]?.trim();
    const itemText = stated.length > 0 ? `Items ${stated.join(', ')}` : null;
    out.push({
      rawUrl: archiveUrl(config.cik, accession, primaryDocument),
      titleHint: [`Form ${form}`, itemText ?? description].filter(Boolean).join(' — '),
      publishedAtHint: filingDate || null,
      filing: {
        form,
        accession,
        items: stated,
        reportDate: recent.reportDate?.[index] || null,
        filerName: root?.name ?? null,
      },
    });
  }
  return out;
}

export const edgarAdapter: ReportDiscoveryAdapter = {
  strategy: 'edgar',
  async discover({ config, now }: ReportAdapterInput): Promise<ReportAdapterResult> {
    const edgar = config.edgar;
    if (!edgar?.cik || !/^\d{1,10}$/.test(edgar.cik)) {
      return configError('edgar.cik is required: the filer\'s numeric Central Index Key');
    }

    const res = await fetchText(submissionsUrl(edgar.cik), {
      'User-Agent': EDGAR_USER_AGENT,
      Accept: 'application/json',
    });
    if (!res.ok) return { ok: false, error: res.error };

    let body: unknown;
    try {
      body = JSON.parse(res.body);
    } catch {
      return { ok: false, error: { kind: 'parse', message: 'EDGAR submissions index is not JSON' } };
    }

    const candidates = parseSubmissions(body, edgar, now);
    // A body with no filings block is a format we do not understand, not a
    // quiet filer, and an empty list would read as the latter.
    if (candidates === null) {
      return { ok: false, error: { kind: 'parse', message: 'EDGAR submissions index has no filings.recent' } };
    }
    return { ok: true, candidates };
  },
};
