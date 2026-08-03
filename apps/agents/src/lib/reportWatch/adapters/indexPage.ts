// Index-page scraping — the only strategy that covers publishers with neither a
// feed nor a sitemap (River, Fidelity), which is most of the ones worth
// watching. That is why it ships in v1 rather than being deferred.
//
// This is the one place in the codebase that uses cheerio. The existing HTML
// handling here is deliberately regex-based, and for the shapes it deals with
// (a known feed format, an og: meta tag) that is the right call. Arbitrary
// publisher markup driven by user-supplied CSS selectors is not one of those
// shapes: `article.report-card h3` cannot be expressed as a regex without
// writing a worse HTML parser by accident.
//
// `follow_to_pdf` is NOT resolved here. The adapter records the landing page as
// `landingUrl` and acquisition follows exactly one hop — keeping the adapter a
// pure fetch-and-parse function of one page, and keeping the fan-out of N extra
// requests under the crawl-delay discipline that lives in the acquisition layer.

import * as cheerio from 'cheerio';
import type {
  ReportAdapterInput,
  ReportAdapterResult,
  ReportDiscoveryAdapter,
  DiscoveredCandidate,
} from '../types.js';
import { configError, parseDateHint } from '../types.js';
import { fetchText } from '../http.js';

/**
 * Pull a date from an element: `datetime` beats visible text, because
 * `<time datetime="2026-07-01">1 July</time>` is unambiguous and "1 July" is
 * not.
 */
function dateFrom($el: cheerio.Cheerio<never>): string | null {
  if ($el.length === 0) return null;
  return parseDateHint($el.attr('datetime') ?? $el.text());
}

export const indexPageAdapter: ReportDiscoveryAdapter = {
  strategy: 'index_page',

  async discover({ config, siteUrl }: ReportAdapterInput): Promise<ReportAdapterResult> {
    const cfg = config.index_page;
    const indexUrl = cfg?.index_url?.trim();
    if (!indexUrl) return configError('index_page detection needs `detection_config.index_page.index_url`');
    const itemSelector = cfg?.item_selector?.trim();
    if (!itemSelector) return configError('index_page detection needs `detection_config.index_page.item_selector`');

    const result = await fetchText(indexUrl, { Accept: 'text/html,application/xhtml+xml' });
    if (!result.ok) return result;

    let $: cheerio.CheerioAPI;
    try {
      $ = cheerio.load(result.body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { kind: 'parse', message: `could not parse ${indexUrl}: ${message}` } };
    }

    const items = $(itemSelector);
    // Zero items is a parse failure, not a clean empty read: it is exactly what
    // a changed class name looks like, and reporting it as `ok: true, []` would
    // feed the silent-failure counter a false negative — which is the one thing
    // the health metric must never be told.
    if (items.length === 0) {
      return {
        ok: false,
        error: { kind: 'parse', message: `selector '${itemSelector}' matched nothing on ${indexUrl}` },
      };
    }

    // Prefer the page's own <base href> for relative links, then the fetched
    // URL, then the source's site_url.
    const base = $('base[href]').attr('href') ?? result.finalUrl ?? siteUrl ?? indexUrl;

    const linkSelector = cfg?.link_selector?.trim() || 'a[href]';
    const pdfSelector = cfg?.pdf_link_selector?.trim() || "a[href$='.pdf']";
    const followToPdf = cfg?.follow_to_pdf === true;

    const candidates: DiscoveredCandidate[] = [];
    const seen = new Set<string>();

    items.each((_, el) => {
      const $item = $(el);

      // A PDF link inside the card beats the card's own link — it is the
      // artefact itself, so no hop is needed at all.
      const direct = $item.find(pdfSelector).attr('href');
      const linked = $item.find(linkSelector).attr('href') ?? $item.attr('href');
      const href = direct ?? linked;
      if (!href) return;

      let resolved: string;
      try {
        resolved = new URL(href, base).toString();
      } catch {
        return;
      }
      if (seen.has(resolved)) return;
      seen.add(resolved);

      const titleHint = cfg?.title_selector
        ? ($item.find(cfg.title_selector).first().text().trim() || null)
        : ($item.find(linkSelector).first().text().trim() || null);

      const publishedAtHint = cfg?.date_selector
        ? dateFrom($item.find(cfg.date_selector).first() as unknown as cheerio.Cheerio<never>)
        : dateFrom($item.find('time').first() as unknown as cheerio.Cheerio<never>);

      candidates.push({
        rawUrl: resolved,
        titleHint,
        publishedAtHint,
        // Only ask for a hop when the config wants one AND what we found is a
        // page rather than the artefact.
        landingUrl: followToPdf && !direct ? resolved : null,
      });
    });

    return { ok: true, candidates };
  },
};
