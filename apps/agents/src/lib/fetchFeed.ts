import Parser from 'rss-parser';

const FEED_TIMEOUT_MS = 20_000;

// rss-parser's default User-Agent gets a 403 from Cloudflare-fronted feeds
// (e.g. bitcoinmagazine.com), which treat it as a bot. A browser-like UA is
// served normally by the large majority of feeds.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FEED_ACCEPT =
  'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.7';

const parser = new Parser();

async function fetchText(url: string, headers: Record<string, string>): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// Fetch and parse an RSS/Atom feed. We fetch the XML ourselves (rather than
// rss-parser's parseURL) so we control the request: a browser User-Agent gets
// past UA-based bot blocks, and on failure we retry through Jina Reader, which
// fetches from its own infrastructure and so bypasses datacenter-IP / Cloudflare
// blocks the direct request can't. The XML is handed to rss-parser via
// parseString. X-Return-Format: html keeps Jina's response as raw markup so the
// feed XML survives for the parser.
export async function fetchFeed(feedUrl: string): Promise<Parser.Output<Record<string, unknown>>> {
  let xml: string;
  try {
    xml = await fetchText(feedUrl, { 'User-Agent': BROWSER_UA, Accept: FEED_ACCEPT });
  } catch (directErr) {
    try {
      xml = await fetchText(`https://r.jina.ai/${encodeURIComponent(feedUrl)}`, {
        'User-Agent': 'Mozilla/5.0 (compatible; BTSResearcher/1.0)',
        'X-Return-Format': 'html',
      });
    } catch (proxyErr) {
      const direct = directErr instanceof Error ? directErr.message : String(directErr);
      const proxy = proxyErr instanceof Error ? proxyErr.message : String(proxyErr);
      throw new Error(`direct fetch failed (${direct}); Jina Reader fallback failed (${proxy})`);
    }
  }
  return parser.parseString(xml);
}
