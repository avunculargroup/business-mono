/**
 * Newsletter link cleaning — tracking wrappers to real URLs.
 *
 * Shared by the email body cleaner (emailClean.ts) and link following
 * (newsletterLinks.ts + researchMailListener). What counts as a wrapper or a
 * subscriber token is defined once in @platform/shared/newsUrl.ts; this module
 * adds what only the agents host can do: decode payloads (Buffer), strip
 * parameters, and spend a request on an opaque redirect.
 *
 * Two kinds of wrapper:
 *  - encodable: the destination sits in the URL (Seeking Alpha click paths,
 *    Customer.io /e/c/ payloads). unwrapOffline decodes these for free.
 *  - opaque: only the sender's server knows the destination (HubSpot, Ghost,
 *    Substack, Mailchimp, …). resolveRedirect asks it, one hop at a time,
 *    without ever reading a body.
 */

import { isSubscriberScoped, isWrapperUrl, subscriberTokenParams } from '@platform/shared';

/**
 * Newsletter chrome names itself in the link text. Moved here from
 * newsletterLinks.ts so the body cleaner removes exactly the anchors link
 * following refuses to follow.
 */
export const DENY_ANCHOR_RE =
  /^(?:unsubscribe|manage (?:your )?(?:email )?(?:preferences|subscriptions?)|update (?:your )?(?:profile|preferences)|view (?:this )?(?:email )?(?:in (?:your )?browser|online|as a web ?page)|read online|share|forward (?:this|to a friend)|tweet|follow us|privacy policy|terms|contact us|advertise|sponsor|upgrade|subscribe|refer a friend|give a gift|powered by|add us to your address book|email preferences|change your preferences|opt out|like|comment|restack|read in (?:the )?app|get the app|start writing|more like this|less like this)\b/i;

/** Per-send campaign identifiers that carry no identity but defeat url dedup. */
const TRACKING_PARAMS: readonly string[] = [
  'ref',
  'source',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'mkt_tok',
  '_hsenc',
  '_hsmi',
  'ck_subscriber_id',
];

/** Substack's app-download nags, appended to every post link in its emails. */
const SUBSTACK_NOISE_PARAMS: readonly string[] = ['redirect', 'inbox', 'isfreemail', 'triedredirect', 'showwelcome'];
const SUBSTACK_HOST_RE = /(^|\.)substack\.com$/;

/** Seeking Alpha's per-send identifiers on the decoded article URL. */
const SEEKING_ALPHA_PARAMS: readonly string[] = ['mailingid', 'serial', 'userid', 'messageid', 'lctg'];
const SEEKING_ALPHA_HOST_RE = /(^|\.)seekingalpha\.com$/;

const SEEKING_ALPHA_CLICK_HOST = 'email-st.seekingalpha.com';
const CUSTOMER_IO_PATH_RE = /^\/e\/c\/([A-Za-z0-9_=-]+)/;

function parseHttp(raw: string): URL | null {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/** base64 or base64url → utf8, or null when it doesn't decode to printable text. */
function decodeBase64(payload: string): string | null {
  try {
    const text = Buffer.from(payload, 'base64').toString('utf8');
    // A wrong guess at the segment decodes to binary; real payloads are ASCII.
    return /^[\x20-\x7e]+$/.test(text) ? text : null;
  } catch {
    return null;
  }
}

/**
 * The real URL behind a wrapper that encodes it, without a request.
 *
 * Returns the input unchanged when it is not a wrapper, the decoded
 * destination when it is an encodable one, and null when it is an opaque
 * wrapper (resolveRedirect's job) or its payload is malformed.
 */
export function unwrapOffline(url: string): string | null {
  const u = parseHttp(url);
  if (!u) return null;
  if (!isWrapperUrl(url)) return url;

  // Seeking Alpha: /click/<serial>/<base64 destination>/<signature>
  if (u.hostname.toLowerCase() === SEEKING_ALPHA_CLICK_HOST) {
    const segments = u.pathname.split('/');
    if (segments[1] !== 'click' || !segments[3]) return null;
    let segment: string;
    try {
      segment = decodeURIComponent(segments[3]);
    } catch {
      return null;
    }
    const decoded = decodeBase64(segment);
    return decoded && parseHttp(decoded) ? decoded : null;
  }

  // Customer.io: /e/c/<base64 JSON with an href>/<signature>
  const cio = CUSTOMER_IO_PATH_RE.exec(u.pathname);
  if (cio) {
    const json = decodeBase64(cio[1]!);
    if (!json) return null;
    try {
      const href = (JSON.parse(json) as { href?: unknown }).href;
      return typeof href === 'string' && parseHttp(href) ? href : null;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Removes campaign parameters and subscriber tokens. Keeps every other
 * parameter (an article id in the query is meaningful), and drops a fragment
 * that is itself parameters (`#source=section%3Amain`). Returns the input
 * unchanged when it isn't an http(s) URL.
 */
export function stripTrackingParams(url: string): string {
  const u = parseHttp(url);
  if (!u) return url;
  const host = u.hostname.toLowerCase();
  const tokens = new Set(subscriberTokenParams(u));
  for (const key of [...u.searchParams.keys()]) {
    const k = key.toLowerCase();
    if (
      k.startsWith('utm_') ||
      TRACKING_PARAMS.includes(k) ||
      tokens.has(key) ||
      (SUBSTACK_HOST_RE.test(host) && SUBSTACK_NOISE_PARAMS.includes(k)) ||
      (SEEKING_ALPHA_HOST_RE.test(host) && SEEKING_ALPHA_PARAMS.includes(k))
    ) {
      u.searchParams.delete(key);
    }
  }
  if (u.hash.includes('=')) u.hash = '';
  return u.toString();
}

/**
 * Identity for dedup: host without www, path without a trailing slash. Query is
 * excluded so the same article behind different campaign params collapses.
 * Null when it isn't a usable http(s) URL.
 */
export function dedupKey(url: string): string | null {
  const u = parseHttp(url);
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = u.pathname.replace(/\/+$/, '').toLowerCase();
  return `${host}${path}`;
}

const RESOLVE_MAX_HOPS = 3;
const RESOLVE_TIMEOUT_MS = 5_000;

/**
 * Follows an opaque wrapper to its destination by reading `Location` headers,
 * never a body. GET rather than HEAD because many wrappers reject HEAD.
 * Repeats while the next hop is still a wrapper, up to 3 hops and 5 seconds in
 * total. Returns null when the chain ends on a wrapper, on a non-redirect
 * response (a JavaScript redirect page), or on any network error — a link that
 * cannot be resolved is skipped, never stored.
 */
export async function resolveRedirect(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
  try {
    let current = url;
    for (let hop = 0; hop < RESOLVE_MAX_HOPS; hop += 1) {
      const res = await fetchImpl(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BTSResearcher/1.0)' },
      });
      // Release the connection without reading what the wrapper sent.
      void res.body?.cancel().catch(() => undefined);

      const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (!location) return null;

      let next: string;
      try {
        next = new URL(location, current).toString();
      } catch {
        return null;
      }
      const decoded = unwrapOffline(next);
      if (decoded && !isWrapperUrl(decoded)) return decoded;
      if (!isWrapperUrl(next)) return null;
      current = next;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A storable URL for `raw`, or null: decoded offline when the wrapper allows,
 * else resolved with one redirect chain, then de-tracked. Null when it cannot
 * be resolved or is still subscriber-scoped. For single URLs per item (an
 * issue's "view in browser" link) — link following budgets its requests itself.
 */
export async function cleanUrl(raw: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const offline = unwrapOffline(raw);
  const real =
    offline && !isWrapperUrl(offline) ? offline : isWrapperUrl(raw) ? await resolveRedirect(raw, fetchImpl) : null;
  if (!real) return null;
  const clean = stripTrackingParams(real);
  return isSubscriberScoped(clean) ? null : clean;
}
