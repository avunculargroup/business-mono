// Sitemap discovery — for publishers with no feed but a well-formed sitemap.
//
// Parsing stays regex-based (<loc>/<lastmod> extraction) rather than pulling in
// an XML library: sitemaps are a rigid, machine-generated format with none of
// the arbitrary nesting that makes index-page scraping need cheerio.
//
// A sitemap index (a sitemap of sitemaps) is followed one level, capped, because
// large publishers split by year and the reports live in exactly one child.
// Deeper recursion is where a crawl turns into a crawl of the whole site.

import type {
  ReportAdapterInput,
  ReportAdapterResult,
  ReportDiscoveryAdapter,
  DiscoveredCandidate,
} from '../types.js';
import { configError, parseDateHint } from '../types.js';
import { fetchText } from '../http.js';

const MAX_CHILD_SITEMAPS = 5;

interface SitemapUrl {
  loc: string;
  lastmod: string | null;
}

function parseUrlEntries(xml: string, tag: 'url' | 'sitemap'): SitemapUrl[] {
  const out: SitemapUrl[] = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const block = match[1];
    const loc = /<loc(?:\s[^>]*)?>([\s\S]*?)<\/loc>/i.exec(block)?.[1]?.trim();
    if (!loc) continue;
    const lastmod = /<lastmod(?:\s[^>]*)?>([\s\S]*?)<\/lastmod>/i.exec(block)?.[1]?.trim() ?? null;
    out.push({ loc: decodeXml(loc), lastmod });
  }
  return out;
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Path-prefix and exclusion filtering, applied to the URL's path only. */
function matchesPath(loc: string, prefix: string | undefined, excludes: string[]): boolean {
  let path: string;
  try {
    path = new URL(loc).pathname;
  } catch {
    return false;
  }
  if (prefix && !path.startsWith(prefix)) return false;
  return !excludes.some((ex) => ex && path.startsWith(ex));
}

export const sitemapAdapter: ReportDiscoveryAdapter = {
  strategy: 'sitemap',

  async discover({ config }: ReportAdapterInput): Promise<ReportAdapterResult> {
    const cfg = config.sitemap;
    const sitemapUrl = cfg?.sitemap_url?.trim();
    if (!sitemapUrl) return configError('sitemap detection needs `detection_config.sitemap.sitemap_url`');

    const root = await fetchText(sitemapUrl, { Accept: 'application/xml, text/xml, */*' });
    if (!root.ok) return root;

    const prefix = cfg?.path_prefix?.trim() || undefined;
    const excludes = (cfg?.path_exclude ?? []).map((e) => e.trim()).filter(Boolean);

    let entries = parseUrlEntries(root.body, 'url');

    // A sitemap index has <sitemap> children instead of <url>. Follow the ones
    // whose own path survives the prefix filter, newest lastmod first.
    if (entries.length === 0) {
      const children = parseUrlEntries(root.body, 'sitemap');
      if (children.length === 0) {
        return { ok: false, error: { kind: 'parse', message: `no <url> or <sitemap> entries in ${sitemapUrl}` } };
      }
      const ordered = [...children].sort((a, b) => (b.lastmod ?? '').localeCompare(a.lastmod ?? ''));
      for (const child of ordered.slice(0, MAX_CHILD_SITEMAPS)) {
        const childResult = await fetchText(child.loc, { Accept: 'application/xml, text/xml, */*' });
        if (!childResult.ok) continue;   // one bad child must not sink the sweep
        entries.push(...parseUrlEntries(childResult.body, 'url'));
      }
      if (entries.length === 0) {
        return { ok: false, error: { kind: 'parse', message: `sitemap index at ${sitemapUrl} yielded no URLs` } };
      }
    }

    entries = entries.filter((e) => matchesPath(e.loc, prefix, excludes));

    // Newest first, so max_candidates_per_run keeps the most recent reports
    // when a first run against a large sitemap has to be paced across days.
    entries.sort((a, b) => (b.lastmod ?? '').localeCompare(a.lastmod ?? ''));

    const candidates: DiscoveredCandidate[] = entries.map((e) => ({
      rawUrl: e.loc,
      titleHint: null,           // a sitemap carries no title — the extractor finds one
      publishedAtHint: parseDateHint(e.lastmod),
      landingUrl: null,
    }));

    return { ok: true, candidates };
  },
};
