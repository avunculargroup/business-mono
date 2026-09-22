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
}

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
    return { imageUrl: null, paywalled: null };
  }
  return { imageUrl: findOgImage(html, url), paywalled: detectPaywall(html) };
}

// Pull the og:image (or twitter:image fallback) from a page's <head>.
export async function fetchOgImage(url: string): Promise<string | null> {
  return (await fetchPageMeta(url)).imageUrl;
}

function findOgImage(html: string, url: string): string | null {
  // Only scan the <head> — that's where social meta tags live, and it bounds the regex.
  const head = html.slice(0, html.search(/<\/head>/i) + 1 || html.length);

  const raw = findMetaContent(head, 'og:image') ?? findMetaContent(head, 'twitter:image');
  if (!raw) return null;

  try {
    return new URL(raw, url).toString();
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

// Match a <meta> tag for the given property/name, regardless of whether the
// identifying attribute comes before or after the content attribute.
function findMetaContent(html: string, key: string): string | null {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${esc}["'][^>]+content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${esc}["']`,
      'i',
    ),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]) return m[1];
  }
  return null;
}
