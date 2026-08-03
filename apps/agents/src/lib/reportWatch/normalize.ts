/**
 * URL normalisation and candidate identity.
 *
 * `url_hash` is the idempotency guard for discovery (UNIQUE on source_id,
 * url_hash), so these rules are load-bearing: loosen them and the same report
 * is re-evaluated every run under a new tracking parameter; tighten them and
 * two genuinely different reports collapse into one.
 *
 * The rules are deliberately conservative — everything not on the strip list is
 * PRESERVED, because some publishers genuinely route by query string
 * (`/download?doc=q2-2026`) and a helpful-looking "strip all query params" rule
 * would silently merge a publisher's entire library into one candidate.
 *
 * Versioned here rather than in the database so a change is reviewable, and so
 * a rule change shows up as a diff rather than as a mysterious wave of
 * re-acquisitions.
 */

import { createHash } from 'node:crypto';

/** Analytics/campaign parameters that never identify content. */
const STRIP_PARAMS = new Set([
  'ref',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'msclkid',
  '_hsenc',
  '_hsmi',
]);

const STRIP_PREFIXES = ['utm_'];

/**
 * Normalise a discovered URL.
 *
 * - lowercase scheme and host (paths stay case-sensitive — many CDNs are)
 * - strip utm_*, ref, fbclid, gclid, mc_cid, mc_eid and friends
 * - strip the fragment
 * - strip a trailing slash, except at the root
 * - preserve every other query parameter, in sorted order so two orderings of
 *   the same parameters hash identically
 *
 * Returns null for anything that is not an absolute http(s) URL — a `mailto:`
 * or a `javascript:` href in a scraped index page is not a candidate.
 */
export function normalizeReportUrl(raw: string, base?: string | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = base ? new URL(trimmed, base) : new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = '';

  const keep: Array<[string, string]> = [];
  for (const [key, value] of url.searchParams.entries()) {
    const lower = key.toLowerCase();
    if (STRIP_PARAMS.has(lower)) continue;
    if (STRIP_PREFIXES.some((p) => lower.startsWith(p))) continue;
    keep.push([key, value]);
  }
  keep.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  url.search = '';
  for (const [key, value] of keep) url.searchParams.append(key, value);

  let out = url.toString();
  // Trailing slash carries no meaning except at the root, where dropping it
  // would turn https://example.com/ into a hostname with no path.
  if (out.endsWith('/') && url.pathname !== '/') out = out.slice(0, -1);
  return out;
}

export function urlHash(normalizedUrl: string): string {
  return createHash('sha256').update(normalizedUrl).digest('hex');
}

/** sha256 over raw artefact bytes — the identity key on `reports`. */
export function contentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Apply the source's `url_filters`. An invalid regex is treated as
 * non-matching rather than thrown: a typo in a config field should skip one
 * source's candidates, not abort the sweep.
 */
export function passesUrlFilters(
  url: string,
  filters: { must_match?: string[]; must_not_match?: string[] } | undefined,
): boolean {
  if (!filters) return true;

  const test = (pattern: string): boolean => {
    try {
      return new RegExp(pattern, 'i').test(url);
    } catch {
      return false;
    }
  };

  const mustMatch = filters.must_match ?? [];
  // must_match is an OR: '\\.pdf$' OR '/reports/' — a URL satisfying either is
  // a report by this source's definition. Requiring all of them would make the
  // common two-rule config match nothing.
  if (mustMatch.length > 0 && !mustMatch.some(test)) return false;

  const mustNot = filters.must_not_match ?? [];
  if (mustNot.some(test)) return false;

  return true;
}

/** Best-effort filename for the stored artefact, from the URL path. */
export function fileNameFromUrl(url: string, fallbackExt: string): string {
  try {
    const { pathname } = new URL(url);
    const last = pathname.split('/').filter(Boolean).pop();
    if (last && /\.[a-z0-9]{2,5}$/i.test(last)) return decodeURIComponent(last);
    if (last) return `${decodeURIComponent(last)}.${fallbackExt}`;
  } catch {
    /* fall through */
  }
  return `report.${fallbackExt}`;
}
