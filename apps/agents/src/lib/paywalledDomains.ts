/**
 * The paywalled-publisher list (paywalled_domains, edited from /news/sources)
 * and the one decision ingestion makes from it and the page.
 *
 * A web article is paywalled when the page declares it, when its body carries
 * paywall wording, or when its host is a listed publisher. The list is the only
 * signal for publishers that block the page fetch outright: a blocked fetch says
 * nothing on its own, because free sites block it too.
 */

import { supabase } from '@platform/db';
import { hasPaywallMarker } from './fetchOgImage.js';
import { createLogger } from './logger.js';

const log = createLogger('paywalled-domains');

// A scan ingests dozens of items back to back; one read covers the run, and an
// edit on /news/sources is live by the next one.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { domains: string[]; loadedAt: number } | null = null;

/** For tests: forget the cached list. */
export function resetPaywalledDomainsCache(): void {
  cache = null;
}

export async function loadPaywalledDomains(): Promise<string[]> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.domains;
  const { data, error } = await supabase.from('paywalled_domains').select('domain');
  if (error) {
    // A failed read must not block ingestion; keep the last good list if any.
    log.warn({ error: error.message }, 'failed to load paywalled domains');
    return cache?.domains ?? [];
  }
  cache = { domains: (data ?? []).map((r) => (r.domain as string).toLowerCase()), loadedAt: Date.now() };
  return cache.domains;
}

/** True when the url's host is a listed domain or a subdomain of one. */
export function matchesPaywalledDomain(url: string, domains: readonly string[]): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return false;
  }
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * The value to persist in news_items.paywalled. `page` is fetchPageMeta's
 * answer (null when the page could not be fetched); `body` is the fetched
 * article text, when there is one. Any positive signal wins; otherwise the
 * page's own answer stands, so a blocked, unlisted page stays null (unknown).
 */
export async function resolvePaywalled(input: {
  url: string;
  page: boolean | null;
  body?: string | null;
}): Promise<boolean | null> {
  if (input.page === true) return true;
  if (input.body && hasPaywallMarker(input.body)) return true;
  if (matchesPaywalledDomain(input.url, await loadPaywalledDomains())) return true;
  return input.page;
}
