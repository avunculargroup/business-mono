/**
 * "Test detection" dry run — what the daily scan would find, without acquiring
 * anything.
 *
 * This is the difference between a scraper someone configures in two minutes and
 * one they abandon. Getting `article.report-card` right by trial and error takes
 * seconds with a preview and is impossible without one.
 *
 * Mirrors `apps/agents/src/lib/reportWatch/adapters/*` the same way
 * `lib/news/fetchFeed.ts` mirrors the agent server's feed fetch, and for the same
 * reason: `apps/*` never import from each other, and a shared package cannot
 * carry cheerio (`@platform/shared` is a leaf, imported by client components).
 *
 * The part that MUST NOT be duplicated is the URL normalisation and filter
 * logic — a dry run that normalises differently from the scan reports something
 * untrue. Those come from `@platform/shared`, which is where they live precisely
 * so both sides apply the same rules.
 *
 * No acquisition, no robots check, no writes. It reads one page and says what it
 * saw.
 */

import * as cheerio from 'cheerio';
import {
  normalizeReportUrl,
  passesUrlFilters,
  type ReportDetectionConfig,
  type ReportDetectionStrategy,
} from '@platform/shared';

const TIMEOUT_MS = 20_000;
const MAX_BYTES = 5_000_000;
/** Enough to judge a selector; a full sitemap would be unreadable in a modal. */
export const PREVIEW_LIMIT = 25;

const USER_AGENT = 'BTSReportWatch/1.0 (+https://btreasury.com.au; research archive)';

export interface DetectionPreviewRow {
  url: string;
  title: string | null;
  publishedAt: string | null;
  /** false = the source's url_filters would reject it. */
  accepted: boolean;
  /** Set when the acquisition step would need to follow a hop to reach the PDF. */
  followsHop: boolean;
}

export type DetectionPreview =
  | {
      ok: true;
      strategy: ReportDetectionStrategy;
      /** Everything the strategy surfaced, before the preview cap. */
      total: number;
      accepted: number;
      rows: DetectionPreviewRow[];
    }
  | { ok: false; error: string };

async function fetchText(url: string, accept: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: accept },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    if (body.length > MAX_BYTES) throw new Error('response exceeded byte cap');
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** ISO-ish prefix first; `datetime` attributes are the common well-formed case. */
function parseDateHint(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

interface RawCandidate {
  rawUrl: string;
  title: string | null;
  publishedAt: string | null;
  followsHop: boolean;
}

// ── rss ──────────────────────────────────────────────────────────────────────

async function previewRss(config: ReportDetectionConfig): Promise<RawCandidate[]> {
  const feedUrl = config.rss?.feed_url?.trim();
  if (!feedUrl) throw new Error('No feed URL configured for the RSS strategy.');

  const xml = await fetchText(feedUrl, 'application/rss+xml, application/xml, text/xml, */*');
  const blocks: string[] = [];
  const re = /<(item|entry)[\s>][\s\S]*?<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) blocks.push(match[0]);

  if (blocks.length === 0) throw new Error('No feed entries found at that URL.');

  const tag = (block: string, name: string): string | null => {
    const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
    if (!m) return null;
    return decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim() || null;
  };
  const attr = (block: string, name: string, key: string): string | null => {
    const m = new RegExp(`<${name}\\b[^>]*\\b${key}\\s*=\\s*["']([^"']+)["'][^>]*>`, 'i').exec(block);
    return m ? decodeEntities(m[1]).trim() || null : null;
  };

  const out: RawCandidate[] = [];
  for (const block of blocks) {
    // An enclosure IS the artefact; the link is one hop away from it.
    const enclosure = attr(block, 'enclosure', 'url');
    const link = tag(block, 'link') ?? attr(block, 'link', 'href') ?? tag(block, 'guid');
    const rawUrl = enclosure ?? link;
    if (!rawUrl) continue;
    out.push({
      rawUrl,
      title: tag(block, 'title'),
      publishedAt: parseDateHint(
        tag(block, 'pubDate') ?? tag(block, 'published') ?? tag(block, 'updated'),
      ),
      followsHop: false,
    });
  }
  return out;
}

// ── sitemap ──────────────────────────────────────────────────────────────────

async function previewSitemap(config: ReportDetectionConfig): Promise<RawCandidate[]> {
  const cfg = config.sitemap;
  const sitemapUrl = cfg?.sitemap_url?.trim();
  if (!sitemapUrl) throw new Error('No sitemap URL configured for the sitemap strategy.');

  const xml = await fetchText(sitemapUrl, 'application/xml, text/xml, */*');
  const entries: Array<{ loc: string; lastmod: string | null }> = [];
  const re = /<url(?:\s[^>]*)?>([\s\S]*?)<\/url>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const loc = /<loc(?:\s[^>]*)?>([\s\S]*?)<\/loc>/i.exec(match[1])?.[1]?.trim();
    if (!loc) continue;
    const lastmod = /<lastmod(?:\s[^>]*)?>([\s\S]*?)<\/lastmod>/i.exec(match[1])?.[1]?.trim() ?? null;
    entries.push({ loc: decodeEntities(loc), lastmod });
  }

  if (entries.length === 0) {
    // The dry run does not follow a sitemap index — the scan does, but a preview
    // that quietly fetched five more documents would not be a preview.
    if (/<sitemapindex/i.test(xml)) {
      throw new Error(
        'That URL is a sitemap index, not a sitemap. The daily scan follows it, but the preview needs a direct sitemap URL.',
      );
    }
    throw new Error('No <url> entries found at that URL.');
  }

  const prefix = cfg?.path_prefix?.trim();
  const excludes = (cfg?.path_exclude ?? []).map((e) => e.trim()).filter(Boolean);
  const inPath = (loc: string): boolean => {
    let path: string;
    try {
      path = new URL(loc).pathname;
    } catch {
      return false;
    }
    if (prefix && !path.startsWith(prefix)) return false;
    return !excludes.some((ex) => path.startsWith(ex));
  };

  return entries
    .filter((e) => inPath(e.loc))
    .sort((a, b) => (b.lastmod ?? '').localeCompare(a.lastmod ?? ''))
    .map((e) => ({
      rawUrl: e.loc,
      title: null,
      publishedAt: parseDateHint(e.lastmod),
      followsHop: false,
    }));
}

// ── index_page ───────────────────────────────────────────────────────────────

async function previewIndexPage(config: ReportDetectionConfig): Promise<RawCandidate[]> {
  const cfg = config.index_page;
  const indexUrl = cfg?.index_url?.trim();
  if (!indexUrl) throw new Error('No index URL configured for the index-page strategy.');
  const itemSelector = cfg?.item_selector?.trim();
  if (!itemSelector) throw new Error('No item selector configured for the index-page strategy.');

  const html = await fetchText(indexUrl, 'text/html,application/xhtml+xml');
  const $ = cheerio.load(html);
  const items = $(itemSelector);
  if (items.length === 0) {
    throw new Error(
      `The selector "${itemSelector}" matched nothing on that page. Open the page, inspect a report card, and copy its class.`,
    );
  }

  const base = $('base[href]').attr('href') ?? indexUrl;
  const linkSelector = cfg?.link_selector?.trim() || 'a[href]';
  const pdfSelector = cfg?.pdf_link_selector?.trim() || "a[href$='.pdf']";
  const followToPdf = cfg?.follow_to_pdf === true;

  const out: RawCandidate[] = [];
  const seen = new Set<string>();

  items.each((_, el) => {
    const $item = $(el);
    const direct = $item.find(pdfSelector).attr('href');
    const href = direct ?? $item.find(linkSelector).attr('href') ?? $item.attr('href');
    if (!href) return;

    let resolved: string;
    try {
      resolved = new URL(href, base).toString();
    } catch {
      return;
    }
    if (seen.has(resolved)) return;
    seen.add(resolved);

    const title = cfg?.title_selector
      ? $item.find(cfg.title_selector).first().text().trim() || null
      : $item.find(linkSelector).first().text().trim() || null;

    const $date = cfg?.date_selector
      ? $item.find(cfg.date_selector).first()
      : $item.find('time').first();

    out.push({
      rawUrl: resolved,
      title,
      publishedAt: $date.length > 0 ? parseDateHint($date.attr('datetime') ?? $date.text()) : null,
      followsHop: followToPdf && !direct,
    });
  });

  return out;
}

/**
 * Run one strategy against live config and report what it found, with a filter
 * verdict per row. Never throws — a misconfigured source should produce an
 * explanation, not a stack trace in a modal.
 */
export async function testDetection(
  strategy: ReportDetectionStrategy,
  config: ReportDetectionConfig,
): Promise<DetectionPreview> {
  try {
    let raw: RawCandidate[];
    if (strategy === 'rss') raw = await previewRss(config);
    else if (strategy === 'sitemap') raw = await previewSitemap(config);
    else raw = await previewIndexPage(config);

    const rows: DetectionPreviewRow[] = [];
    const seen = new Set<string>();
    for (const cand of raw) {
      const url = normalizeReportUrl(cand.rawUrl);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      rows.push({
        url,
        title: cand.title,
        publishedAt: cand.publishedAt,
        accepted: passesUrlFilters(url, config.url_filters),
        followsHop: cand.followsHop,
      });
    }

    return {
      ok: true,
      strategy,
      total: rows.length,
      accepted: rows.filter((r) => r.accepted).length,
      rows: rows.slice(0, PREVIEW_LIMIT),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
