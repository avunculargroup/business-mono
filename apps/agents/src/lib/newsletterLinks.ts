/**
 * Newsletter body → followable article links.
 *
 * Research newsletters are frequently link roundups: the substance sits behind
 * the links, not in the email body. This module picks the substantive ones out
 * of the raw HTML so researchMailListener can fetch and ingest each as its own
 * news_items row.
 *
 * Deliberately heuristic and deterministic — no LLM. The filters are tuned for
 * precision over recall: with a hard cap of a handful of links per issue, a
 * missed article costs less than a fetched sponsor banner (which burns a Jina
 * fetch plus two LLM calls and lands junk in the feed).
 *
 * Tracking wrappers (link.mail.beehiiv.com, list-manage.com/track/click, …) are
 * NOT resolved here. Jina Reader fetches server-side and follows redirects, so
 * the fetch returns the real article anyway — resolving them ourselves would
 * double the request count for no content gain, and many wrappers reject HEAD
 * or count it as a click.
 */

// Same bound htmlToMarkdown uses — the agents host is memory-constrained.
const MAX_HTML_CHARS = 500_000;

// Matches newsletterExtract.extractCanonicalUrl so both read the same anchors.
const ANCHOR_RE = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

/** Assets occasionally wrapped in an anchor — tracking pixels, logos, stylesheets. */
const ASSET_EXT_RE = /\.(gif|png|jpe?g|webp|svg|ico|css|js|woff2?)$/i;

/**
 * Hosts that never carry a readable article. YouTube is here deliberately:
 * Jina returns near-empty markdown for a video page, so following one always
 * costs a fetch and yields nothing.
 */
const DENY_HOSTS: readonly string[] = [
  'twitter.com',
  'x.com',
  'facebook.com',
  'linkedin.com',
  'instagram.com',
  'threads.net',
  't.me',
  'reddit.com',
  'youtube.com',
  'youtu.be',
  'apps.apple.com',
  'play.google.com',
  'patreon.com',
  'paypal.com',
  'stripe.com',
  'sparkloop.app',
  'campaign-archive.com',
];

/**
 * Newsletter chrome by path/query. Note list-manage.com is NOT host-denied:
 * Mailchimp's /track/click IS the article link — only these paths are chrome.
 */
const DENY_PATH_RE =
  /\/unsubscribe|unsub|opt-?out|manage[-_]?preferences|\/preferences|\/subscription|\/profile|\/account|\/login|\/signup|\/upgrade|\/subscribe|\/pricing|\/donate|\/refer|\/share|\/forward|\/privacy|\/terms|\/contact|\/advertise|\/sponsor|\/feedback|\/survey|\/vcard|\/track\/open/i;

/** The highest-yield filter: newsletter chrome names itself in the link text. */
const DENY_ANCHOR_RE =
  /^(?:unsubscribe|manage (?:your )?(?:email )?preferences|update your profile|view (?:this )?(?:email )?in (?:your )?browser|view online|read online|share|forward (?:this|to a friend)|tweet|follow us|privacy policy|terms|contact us|advertise|sponsor|upgrade|subscribe|refer a friend|give a gift|powered by|add us to your address book)\b/i;

/** Anchor text that carries no title signal — keep the link, drop the text. */
const GENERIC_ANCHOR_RE = /^(?:here|this|link|read more|more|click here|continue reading|→|»|>>)$/i;

/** Per-send campaign identifiers — stripping them is what makes url dedup work. */
const TRACKING_PARAMS: readonly string[] = [
  'ref',
  'source',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'mkt_tok',
];

export interface NewsletterLink {
  /** Absolute http(s) URL with campaign params stripped. Stored as news_items.url. */
  url: string;
  /** Tag-stripped anchor text; '' when generic or a bare URL. Never used as the title on its own. */
  anchorText: string;
}

export interface ExtractNewsletterLinksOptions {
  /** Hard cap on returned links. */
  max: number;
  /** URLs never to follow — the parent item's own url and canonical_url. */
  excludeUrls?: readonly string[];
}

/** Collapses tags and whitespace out of an anchor's inner HTML. */
function anchorTextOf(inner: string): string {
  return inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Identity for dedup: host without www, path without a trailing slash. Query is
 * excluded so the same article behind different campaign params collapses.
 */
function dedupKey(u: URL): string {
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = u.pathname.replace(/\/+$/, '').toLowerCase();
  return `${host}${path}`;
}

/** Same key for a raw string, or null when it isn't a usable http(s) URL. */
function dedupKeyOf(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return dedupKey(u);
  } catch {
    return null;
  }
}

function stripTrackingParams(u: URL): string {
  for (const key of [...u.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMS.includes(key.toLowerCase())) {
      u.searchParams.delete(key);
    }
  }
  return u.toString();
}

function isDeniedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return DENY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * Substantive article links from a newsletter's raw HTML, in document order
 * (roundups lead with the main story), deduped and capped at `opts.max`.
 */
export function extractNewsletterLinks(
  html: string,
  opts: ExtractNewsletterLinksOptions,
): NewsletterLink[] {
  if (opts.max <= 0) return [];

  const capped = html.length > MAX_HTML_CHARS ? html.slice(0, MAX_HTML_CHARS) : html;
  const seen = new Set<string>();
  for (const raw of opts.excludeUrls ?? []) {
    const key = dedupKeyOf(raw);
    if (key) seen.add(key);
  }

  const out: NewsletterLink[] = [];
  const re = new RegExp(ANCHOR_RE.source, ANCHOR_RE.flags);
  let m: RegExpExecArray | null;

  while ((m = re.exec(capped)) !== null) {
    if (out.length >= opts.max) break;

    // Hrefs in email HTML are entity-escaped; not decoding corrupts query strings.
    const href = m[1]!.replace(/&amp;/gi, '&').trim();
    // The one protocol test — also drops mailto:, tel:, #fragment, javascript:, data:
    // and relative hrefs, all of which are meaningless in an email body.
    if (!/^https?:\/\//i.test(href)) continue;

    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      continue;
    }

    if (isDeniedHost(parsed.hostname)) continue;
    if (ASSET_EXT_RE.test(parsed.pathname)) continue;
    if (DENY_PATH_RE.test(`${parsed.pathname}${parsed.search}`)) continue;

    const text = anchorTextOf(m[2] ?? '');
    // Empty after tag-stripping means the anchor wrapped only an image: almost
    // always a sponsor banner or header art. Real stories have a text twin.
    if (!text) continue;
    if (DENY_ANCHOR_RE.test(text)) continue;

    const key = dedupKey(parsed);
    if (seen.has(key)) continue;
    seen.add(key);

    const isTitleLike =
      !GENERIC_ANCHOR_RE.test(text) && !/^https?:\/\//i.test(text);

    out.push({
      url: stripTrackingParams(parsed),
      anchorText: isTitleLike ? text : '',
    });
  }

  return out;
}
