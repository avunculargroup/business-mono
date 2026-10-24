/**
 * Newsletter tracking wrappers and subscriber tokens.
 *
 * One definition shared by the agents' ingest (apps/agents lib/urlClean.ts),
 * the article renderer (packages/ui ArticleMarkdown) and, later, the client
 * app. A URL that matches here either redirects through an email platform or
 * identifies BTS's paid subscription — storing it, or rendering it as a link,
 * lets a click register as BTS. See docs/news-source-email-extraction-spec.md.
 *
 * The lists were built from the hosts actually present in news_items on
 * 24 Oct 2026. Add to them when a new template family shows up; the
 * isSubscriberScoped assertion before every insert is what catches one.
 */

/** Hosts (and their subdomains) that only ever serve tracking redirects. */
export const NEWS_WRAPPER_HOSTS: readonly string[] = [
  'email-st.seekingalpha.com', // Seeking Alpha — destination base64 in the path
  'hubspotlinks.com',
  'hubspotlinksfree.com',
  'hubspotemail.net',
  'sbstck.com', // Substack link.sbstck.com/redirect
  'email.mg.substack.com',
  'list-manage.com', // Mailchimp, incl. /track/click and /_<id>?e=
  'link.mail.beehiiv.com',
  'beehiivstatus.com',
  'createsend.com',
  'createsend1.com',
  'cmail19.com',
  'cmail20.com',
  'updatemyprofile.com', // Campaign Monitor preference pages
  'ct.sendgrid.net',
  'convertkit-mail.com',
  'convertkit-mail2.com',
  'click.pstmrk.it',
  'clicks.aweber.com',
  't.cpaaustralia.com.au', // Marketo click host
];

/**
 * Wrapper shapes that live on a publisher's own domain, recognised by path.
 * `host`, when present, narrows the rule to matching hostnames.
 */
const WRAPPER_PATHS: ReadonlyArray<{ path: RegExp; host?: RegExp }> = [
  { path: /^\/redirect\//, host: /(^|\.)substack\.com$/ },
  { path: /^\/e\/c\/[A-Za-z0-9_=-]{20,}/ }, // Customer.io — base64 JSON with an href
  { path: /\/r\/[0-9a-f]{8}\/?$/ }, // Ghost member redirect, /r/<id>?m=<member uuid>
  { path: /^\/ls\/click\/?$/ }, // SendGrid
  { path: /^\/track\/click\/?$/ }, // Mailchimp on a custom domain
  { path: /^\/t\/[a-z]-[a-z]-/ }, // Campaign Monitor
  { path: /^\/link\/id\// }, // Vuture
  { path: /^\/e\/\d+\/\d{4}-\d{2}-\d{2}\// }, // Pardot
  { path: /\/hclick\/?$/ }, // beehiiv
];

/** Query parameters that identify the recipient on any host. */
const TOKEN_PARAMS: readonly string[] = [
  '_hsenc',
  '_hsmi',
  'mc_eid',
  'ck_subscriber_id',
  'mkt_tok',
  'userid',
  'user_id',
  'subscriber_id',
  'sailthru_auth_param',
  'oly_enc_id',
  'oly_anon_id',
  'vero_id',
];

/** Parameters that are tokens only on particular hosts, where they are generic elsewhere. */
const HOST_TOKEN_PARAMS: ReadonlyArray<{ host: RegExp; params: readonly string[] }> = [
  // r = the reader's referral code, token = a signed login link.
  { host: /(^|\.)substack\.com$/, params: ['r', 'token', 'j'] },
  // e = the Mailchimp subscriber id.
  { host: /(^|\.)(list-manage\.com|mailchi\.mp)$/, params: ['e'] },
  { host: /(^|\.)seekingalpha\.com$/, params: ['lctg', 'serial', 'mailingid'] },
];

/** A signed token as a parameter value: a JWT, whatever the parameter is called. */
const JWT_VALUE_RE = /^eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]+/;

/** Ghost puts the member uuid on its redirect and feedback links. */
const GHOST_MEMBER_PATH_RE = /\/r\/[0-9a-f]{8}\/?$|\/members\//;

function parseHttp(raw: string): URL | null {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

function hostMatches(hostname: string, host: string): boolean {
  return hostname === host || hostname.endsWith(`.${host}`);
}

/** Whether the URL is an email platform's click redirect rather than a destination. */
export function isWrapperUrl(url: string): boolean {
  const u = parseHttp(url);
  if (!u) return false;
  const host = u.hostname.toLowerCase();
  if (NEWS_WRAPPER_HOSTS.some((h) => hostMatches(host, h))) return true;
  return WRAPPER_PATHS.some((r) => r.path.test(u.pathname) && (!r.host || r.host.test(host)));
}

/**
 * Names of the query parameters on `u` that identify the recipient. Shared so
 * the agents' tracking-parameter strip removes exactly what this module flags.
 */
export function subscriberTokenParams(u: URL): string[] {
  const host = u.hostname.toLowerCase();
  const hostParams = HOST_TOKEN_PARAMS.filter((r) => r.host.test(host)).flatMap((r) => r.params);
  const ghostMember = GHOST_MEMBER_PATH_RE.test(u.pathname);
  const out: string[] = [];
  for (const [key, value] of u.searchParams) {
    const k = key.toLowerCase();
    if (
      TOKEN_PARAMS.includes(k) ||
      hostParams.includes(k) ||
      (ghostMember && (k === 'm' || k === 'uuid' || k === 'key')) ||
      JWT_VALUE_RE.test(value)
    ) {
      out.push(key);
    }
  }
  return out;
}

/**
 * True when the URL must not be stored or rendered as a link: it is a tracking
 * wrapper, or it carries a parameter that identifies BTS's subscription.
 * False for anything that is not an http(s) URL — callers filter those
 * separately.
 */
export function isSubscriberScoped(url: string): boolean {
  const u = parseHttp(url);
  if (!u) return false;
  return isWrapperUrl(url) || subscriberTokenParams(u).length > 0;
}
