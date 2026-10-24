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
 * Tracking wrappers must be resolved before any filter or dedup can mean
 * anything: a wrapper's host says nothing about its destination, and it is
 * unique per send. Encodable wrappers are decoded here, for free; opaque ones
 * come back `wrapped: true` for the listener to resolve with resolveRedirect,
 * after which it runs linkDenyReason on the real URL. (Jina was once assumed
 * to do this unwrapping — its data.url echoed the wrapper for 99% of links.)
 */

import { isWrapperUrl } from '@platform/shared';
import { DENY_ANCHOR_RE, dedupKey, stripTrackingParams, unwrapOffline } from './urlClean.js';

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

/** Anchor text that carries no title signal — keep the link, drop the text. */
const GENERIC_ANCHOR_RE = /^(?:here|this|link|read more|more|click here|continue reading|→|»|>>)$/i;

/**
 * Sending platforms many publications share. A sender or canonical host on one
 * of these says nothing about which links are the newsletter's own, so it never
 * counts as a self host — Pompliano sends from substack.com and links to other
 * writers' Substack posts.
 */
const SHARED_PLATFORM_DOMAINS: readonly string[] = [
  'substack.com',
  'ghost.io',
  'beehiiv.com',
  'mailchimp.com',
  'mailchi.mp',
  'convertkit.com',
  'kit.com',
  'hubspot.com',
  'hubspotemail.net',
  'medium.com',
  'gmail.com',
];

/** Profile, app and post-share pages that Substack links from every issue. */
const DENY_SUBSTACK_PATH_RE = /^\/(?:@|app-link\/|profile\/|refer|subscribe)/;

export interface NewsletterLink {
  /**
   * Absolute http(s) URL with campaign params stripped and any encodable
   * wrapper decoded. While `wrapped` is true it is still the in-email href.
   */
  url: string;
  /** Tag-stripped anchor text; '' when generic or a bare URL. Never used as the title on its own. */
  anchorText: string;
  /** An opaque tracking wrapper: resolve it before filtering, deduping or fetching. */
  wrapped: boolean;
}

export interface ExtractNewsletterLinksOptions {
  /** URLs never to follow — the parent item's own url and canonical_url. */
  excludeUrls?: readonly string[];
}

/** Per-source and per-issue rules applied to a link's real URL. */
export interface LinkRules {
  /**
   * The newsletter's own hosts (sender domain, canonical_url host): links back
   * to its own issues. Shared sending platforms are ignored, and a link that
   * matches an allow pattern is never a self link — for a publisher whose
   * newsletter is a gateway to its own site, those links are the content.
   */
  selfHosts?: readonly string[];
  /** news_sources.link_allow_patterns — when non-empty, a link must match one. */
  allowPatterns?: readonly string[];
  /** news_sources.link_deny_patterns — checked after the global deny lists. */
  denyPatterns?: readonly string[];
}

/** Collapses tags and whitespace out of an anchor's inner HTML. */
function anchorTextOf(inner: string): string {
  return inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function hostMatches(hostname: string, host: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, '');
  const want = host.toLowerCase().replace(/^www\./, '');
  return h === want || h.endsWith(`.${want}`);
}

function isDeniedHost(hostname: string): boolean {
  return DENY_HOSTS.some((h) => hostMatches(hostname, h));
}

/**
 * Whether `u` matches a host or host-plus-path prefix such as
 * `seekingalpha.com/article/`. A bare host also matches its subdomains.
 */
export function matchesLinkPattern(u: URL, pattern: string): boolean {
  const p = pattern.trim().toLowerCase().replace(/^https?:\/\//, '');
  if (!p) return false;
  const slash = p.indexOf('/');
  const host = slash === -1 ? p : p.slice(0, slash);
  const path = slash === -1 ? '' : p.slice(slash);
  return hostMatches(u.hostname, host) && u.pathname.toLowerCase().startsWith(path);
}

/**
 * Why a link's real URL must not be followed, or null when it may be. Runs on
 * a resolved URL — the global deny lists, then the source's own patterns,
 * then the newsletter's own hosts.
 */
export function linkDenyReason(url: string, rules: LinkRules = {}): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'invalid_url';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'not_http';
  if (isDeniedHost(u.hostname)) return 'deny_host';
  if (ASSET_EXT_RE.test(u.pathname)) return 'asset';
  if (DENY_PATH_RE.test(`${u.pathname}${u.search}`)) return 'deny_path';
  if (hostMatches(u.hostname, 'substack.com') && DENY_SUBSTACK_PATH_RE.test(u.pathname)) return 'deny_path';
  if ((rules.denyPatterns ?? []).some((p) => matchesLinkPattern(u, p))) return 'source_deny';
  const allow = (rules.allowPatterns ?? []).filter((p) => p.trim());
  if (allow.length > 0) return allow.some((p) => matchesLinkPattern(u, p)) ? null : 'source_allow';
  const self = (rules.selfHosts ?? []).filter(
    // Exact: example.ghost.io is one publication; ghost.io is all of them.
    (h) => h && !SHARED_PLATFORM_DOMAINS.includes(h.toLowerCase().replace(/^www\./, '')),
  );
  if (self.some((h) => hostMatches(u.hostname, h))) return 'self_link';
  return null;
}

/**
 * Candidate article links from a newsletter's raw HTML, in document order
 * (roundups lead with the main story) and deduped within the issue. Uncapped:
 * the cap applies after the listener has resolved and filtered, so chrome no
 * longer eats the budget.
 *
 * Links whose destination is already known are filtered here with the global
 * rules; wrapped links get only the checks that don't need a destination
 * (anchor text, chrome paths on the wrapper itself).
 */
export function extractNewsletterLinks(
  html: string,
  opts: ExtractNewsletterLinksOptions = {},
): NewsletterLink[] {
  const capped = html.length > MAX_HTML_CHARS ? html.slice(0, MAX_HTML_CHARS) : html;
  const seen = new Set<string>();
  for (const raw of opts.excludeUrls ?? []) {
    const key = dedupKey(raw);
    if (key) seen.add(key);
  }

  const out: NewsletterLink[] = [];
  const re = new RegExp(ANCHOR_RE.source, ANCHOR_RE.flags);
  let m: RegExpExecArray | null;

  while ((m = re.exec(capped)) !== null) {
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

    const text = anchorTextOf(m[2] ?? '');
    // Empty after tag-stripping means the anchor wrapped only an image: almost
    // always a sponsor banner or header art. Real stories have a text twin.
    if (!text) continue;
    if (DENY_ANCHOR_RE.test(text)) continue;

    const decoded = unwrapOffline(parsed.toString());
    let url: string;
    let wrapped: boolean;
    if (decoded && !isWrapperUrl(decoded)) {
      url = stripTrackingParams(decoded);
      wrapped = false;
      if (linkDenyReason(url)) continue;
    } else {
      // Opaque, or decoded to another wrapper. Chrome paths still show on the
      // wrapper itself (Mailchimp /unsubscribe, /vcard, /track/open).
      if (DENY_PATH_RE.test(`${parsed.pathname}${parsed.search}`)) continue;
      url = parsed.toString();
      wrapped = true;
    }

    const key = dedupKey(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const isTitleLike =
      !GENERIC_ANCHOR_RE.test(text) && !/^https?:\/\//i.test(text);

    out.push({ url, anchorText: isTitleLike ? text : '', wrapped });
  }

  return out;
}
