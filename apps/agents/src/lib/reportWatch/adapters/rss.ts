// RSS/Atom discovery — the cheapest strategy, tried first where a publisher
// has a feed at all.
//
// Deliberately NOT reusing lib/fetchFeed.ts's rss-parser: this adapter has to
// prefer an <enclosure> over the item link (a feed announcing a report usually
// links the landing page but encloses the PDF), and it must never throw across
// the discovery seam. Going through the shared http helper keeps both properties.

import type {
  ReportAdapterInput,
  ReportAdapterResult,
  ReportDiscoveryAdapter,
  DiscoveredCandidate,
} from '../types.js';
import { configError, parseDateHint } from '../types.js';
import { fetchText } from '../http.js';

/** Split a feed body into <item>/<entry> blocks. Regex, matching house style. */
function feedEntries(xml: string): string[] {
  const blocks: string[] = [];
  const re = /<(item|entry)[\s>][\s\S]*?<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) blocks.push(match[0]);
  return blocks;
}

function tagText(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  const m = re.exec(block);
  if (!m) return null;
  return decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim() || null;
}

function attr(block: string, tag: string, name: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${name}\\s*=\\s*["']([^"']+)["'][^>]*>`, 'i');
  const m = re.exec(block);
  return m ? decodeEntities(m[1]).trim() || null : null;
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

/**
 * Atom's link is an attribute, RSS's is element text. Prefer an enclosure when
 * one is present — a feed item that both links a landing page and encloses the
 * artefact is telling us where the artefact is, and taking the link instead
 * would cost an extra hop for information already in hand.
 */
function entryUrl(block: string): { url: string | null; landing: string | null } {
  const enclosure = attr(block, 'enclosure', 'url');
  const link =
    tagText(block, 'link') ??
    attr(block, 'link', 'href') ??
    tagText(block, 'guid');
  if (enclosure) return { url: enclosure, landing: link };
  return { url: link, landing: null };
}

export const rssAdapter: ReportDiscoveryAdapter = {
  strategy: 'rss',

  async discover({ config }: ReportAdapterInput): Promise<ReportAdapterResult> {
    const feedUrl = config.rss?.feed_url?.trim();
    if (!feedUrl) return configError('rss detection needs `detection_config.rss.feed_url`');

    const result = await fetchText(feedUrl, { Accept: 'application/rss+xml, application/xml, text/xml, */*' });
    if (!result.ok) return result;

    const blocks = feedEntries(result.body);
    if (blocks.length === 0 && !/<(rss|feed)\b/i.test(result.body)) {
      return { ok: false, error: { kind: 'parse', message: `no feed entries in ${feedUrl}` } };
    }

    const candidates: DiscoveredCandidate[] = [];
    for (const block of blocks) {
      const { url, landing } = entryUrl(block);
      if (!url) continue;
      candidates.push({
        rawUrl: url,
        titleHint: tagText(block, 'title'),
        publishedAtHint: parseDateHint(
          tagText(block, 'pubDate') ?? tagText(block, 'published') ?? tagText(block, 'updated'),
        ),
        landingUrl: landing,
      });
    }

    return { ok: true, candidates };
  },
};
