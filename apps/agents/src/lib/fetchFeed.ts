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

// Stream the body, decoding as we go but aborting the moment the byte count
// crosses maxBytes, so an oversized response (e.g. a podcast transcript tag that
// points at a multi-hundred-MB file or a full HTML page) never gets fully
// buffered. Buffering it then running regex .replace() passes over it is exactly
// what OOM-kills the ingestion routine. The Content-Length header is checked
// first as a cheap early-out; missing/lying headers are caught by the running
// tally. Falls back to res.text() when the runtime gives no readable stream.
async function readTextCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`response too large (${declared} bytes > ${maxBytes} byte cap)`);
  }
  if (!res.body) return await res.text();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new Error(`response exceeded ${maxBytes} byte cap`);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    // Stops the download on the oversized-throw path; a no-op once fully read.
    await reader.cancel().catch(() => {});
  }
}

export async function fetchText(
  url: string,
  headers: Record<string, string>,
  maxBytes?: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return maxBytes === undefined ? await res.text() : await readTextCapped(res, maxBytes);
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
async function fetchFeedXml(feedUrl: string): Promise<string> {
  try {
    return await fetchText(feedUrl, { 'User-Agent': BROWSER_UA, Accept: FEED_ACCEPT });
  } catch (directErr) {
    try {
      return await fetchText(`https://r.jina.ai/${encodeURIComponent(feedUrl)}`, {
        'User-Agent': 'Mozilla/5.0 (compatible; BTSResearcher/1.0)',
        'X-Return-Format': 'html',
      });
    } catch (proxyErr) {
      const direct = directErr instanceof Error ? directErr.message : String(directErr);
      const proxy = proxyErr instanceof Error ? proxyErr.message : String(proxyErr);
      throw new Error(`direct fetch failed (${direct}); Jina Reader fallback failed (${proxy})`);
    }
  }
}

export async function fetchFeed(feedUrl: string): Promise<Parser.Output<Record<string, unknown>>> {
  return parser.parseString(await fetchFeedXml(feedUrl));
}

// Podcast feeds carry tags the default parser drops: the Podcasting 2.0
// <podcast:transcript> element (often repeated for multiple formats/languages),
// <itunes:duration>, season/episode numbers, and artwork. A parser configured
// with these customFields surfaces them on each item. keepArray:true on
// transcript preserves every <podcast:transcript> entry so the waterfall can
// pick the best format/language.
const podcastParser = new Parser<
  Record<string, unknown>,
  Record<string, unknown>
>({
  customFields: {
    item: [
      ['podcast:transcript', 'podcastTranscripts', { keepArray: true }],
      ['itunes:duration', 'itunesDuration'],
      ['itunes:season', 'itunesSeason'],
      ['itunes:episode', 'itunesEpisode'],
      ['itunes:image', 'itunesImage'],
    ],
  },
});

export async function fetchPodcastFeed(
  feedUrl: string,
): Promise<Parser.Output<Record<string, unknown>>> {
  return podcastParser.parseString(await fetchFeedXml(feedUrl));
}
