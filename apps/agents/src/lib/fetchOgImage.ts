import { decodeHtmlEntities } from './emailImage.js';
import { fetchText } from './fetchFeed.js';

// A browser-like User-Agent gets past UA-based bot blocks on most news sites,
// matching how fetchFeed fetches feed XML.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface PageMeta {
  /** og:image (or twitter:image) as an absolute URL, or null. */
  imageUrl: string | null;
  /**
   * True when the page declares itself paywalled, false when it was fetched and
   * carries no paywall signal, null when the page could not be fetched at all.
   */
  paywalled: boolean | null;
  /** Every title the page offers, for resolveHeadline. All null when the fetch failed. */
  titles: PageTitles;
}

export interface PageTitles {
  og: string | null;
  /** The first `headline` in the page's JSON-LD (Article/NewsArticle/BlogPosting, @graph included). */
  jsonld: string | null;
  h1: string | null;
  twitter: string | null;
  /** og:site_name — not a candidate, but tells resolveHeadline what the site calls itself. */
  siteName: string | null;
  htmlTitle: string | null;
}

const NO_TITLES: PageTitles = { og: null, jsonld: null, h1: null, twitter: null, siteName: null, htmlTitle: null };

// Fetch a page once and read what ingestion wants from it: the og:image (or
// twitter:image fallback) from its <head>, and whether it declares a paywall.
// Best effort only: any network error yields { imageUrl: null, paywalled: null },
// and a missing tag or unparseable URL yields a null image, so the caller can
// degrade gracefully.
export async function fetchPageMeta(url: string): Promise<PageMeta> {
  let html: string;
  try {
    html = await fetchText(url, { 'User-Agent': BROWSER_UA, Accept: 'text/html,*/*;q=0.8' });
  } catch {
    return { imageUrl: null, paywalled: null, titles: { ...NO_TITLES } };
  }
  return { imageUrl: findOgImage(html, url), paywalled: detectPaywall(html), titles: findPageTitles(html) };
}

function headOf(html: string): string {
  return html.slice(0, html.search(/<\/head>/i) + 1 || html.length);
}

/** Tags stripped, entities decoded, whitespace collapsed; null when nothing is left. */
function textOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = decodeHtmlEntities(raw.replace(/<[^>]+>/g, ' ')).replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ')
    // A stripped inline tag before punctuation leaves a stray space: "<em>Pacific</em>:".
    .replace(/\s+([:;,.!?])/g, '$1')
    .trim();
  return text || null;
}

// Collect the page's title candidates. Social meta and <title> come from the
// <head>; the <h1> and JSON-LD can sit anywhere, so the whole page is scanned.
export function findPageTitles(html: string): PageTitles {
  const head = headOf(html);
  return {
    og: textOf(findMetaContent(head, 'og:title')),
    jsonld: findJsonLdHeadline(html),
    h1: textOf(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]),
    twitter: textOf(findMetaContent(head, 'twitter:title')),
    siteName: textOf(findMetaContent(head, 'og:site_name')),
    htmlTitle: textOf(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1]),
  };
}

const ARTICLE_TYPE = /(?:Article|BlogPosting|Posting)$/;

// The first `headline` in any JSON-LD block, preferring article-typed nodes.
// Publishers ship malformed JSON-LD often enough that a parse failure just
// skips that block.
export function findJsonLdHeadline(html: string): string | null {
  const blocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  let untyped: string | null = null;
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1]!.trim());
    } catch {
      continue;
    }
    const stack: unknown[] = [parsed];
    while (stack.length > 0) {
      const node = stack.shift();
      if (Array.isArray(node)) {
        stack.push(...node);
        continue;
      }
      if (!node || typeof node !== 'object') continue;
      const obj = node as Record<string, unknown>;
      if (Array.isArray(obj['@graph'])) stack.push(...(obj['@graph'] as unknown[]));
      const headline = typeof obj['headline'] === 'string' ? textOf(obj['headline']) : null;
      if (!headline) continue;
      const types = ([] as unknown[]).concat(obj['@type'] ?? []);
      if (types.some((t) => typeof t === 'string' && ARTICLE_TYPE.test(t))) return headline;
      untyped ??= headline;
    }
  }
  return untyped;
}

// Pull the og:image (or twitter:image fallback) from a page's <head>.
export async function fetchOgImage(url: string): Promise<string | null> {
  return (await fetchPageMeta(url)).imageUrl;
}

function findOgImage(html: string, url: string): string | null {
  // Only scan the <head> — that's where social meta tags live, and it bounds the regex.
  const head = headOf(html);

  const raw = findMetaContent(head, 'og:image') ?? findMetaContent(head, 'twitter:image');
  if (!raw) return null;

  try {
    return new URL(decodeHtmlEntities(raw), url).toString();
  } catch {
    return null;
  }
}

// schema.org's isAccessibleForFree=false is the markup publishers give Google
// for paywalled articles (JSON-LD or microdata, and JSON-LD often sits in the
// <body>, so the whole page is scanned). article:content_tier is the Open Graph
// equivalent some publishers use instead; "metered" still ends at a paywall.
export function detectPaywall(html: string): boolean {
  if (/"isAccessibleForFree"\s*:\s*"?false"?/i.test(html)) return true;
  if (/<[^>]+itemprop=["']isAccessibleForFree["'][^>]+content=["']false["']/i.test(html)) return true;
  if (/<[^>]+content=["']false["'][^>]+itemprop=["']isAccessibleForFree["']/i.test(html)) return true;
  const tier = findMetaContent(html, 'article:content_tier');
  return tier !== null && /^(?:locked|metered)$/i.test(tier.trim());
}

// A fetched article body that is only a "subscribe to continue" stub — the
// reader-mode text a paywalled page yields to a bot that isn't logged in.
const PAYWALL_STUB_RE =
  /subscribe to (?:continue|read)|create an account to|this content is for (?:subscribers|members)|already a (?:subscriber|member)\?/i;

export function isPaywallStub(markdown: string): boolean {
  return PAYWALL_STUB_RE.test(markdown.slice(0, 2000));
}

// Paywall wording anywhere in a fetched body. Wider than the stub check: FT's
// "Subscribe to unlock this article" sits ~12k characters in, after the site
// navigation, where a 2k-character stub check never looks. Only phrases that
// name a subscription wall — bare "subscribe" appears in free sites' footers.
const PAYWALL_MARKER_RE =
  /subscribe to unlock|unlock (?:this|the full) article|(?:subscribe|sign in|log in|register) to continue reading/i;

export function hasPaywallMarker(markdown: string): boolean {
  return PAYWALL_STUB_RE.test(markdown) || PAYWALL_MARKER_RE.test(markdown);
}

// Match a <meta> tag for the given property/name, regardless of whether the
// identifying attribute comes before or after the content attribute.
function findMetaContent(html: string, key: string): string | null {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Quote-aware: a title such as content="Saylor's bet" holds the other quote.
  const content = `content=(?:"([^"]*)"|'([^']*)')`;
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]+${content}`, 'i'),
    new RegExp(`<meta[^>]+${content}[^>]+(?:property|name)=["']${esc}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    const value = m?.[1] ?? m?.[2];
    if (value) return value;
  }
  return null;
}
