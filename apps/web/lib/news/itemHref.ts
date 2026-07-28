/**
 * Where a news item's headline should point.
 *
 * Email-sourced items have no real URL — news_items.url is NOT NULL UNIQUE, so
 * ingestion synthesizes `email://{slug}/{message-id}`, which opens nothing when
 * used as an href. Those fall back to the in-app reading view, which renders
 * the stored body_markdown.
 *
 * canonical_url is deliberately not consulted here: it is the publisher's
 * hosted copy of the whole issue, surfaced as "View original" on the detail
 * page rather than as the headline's destination.
 */
export function newsItemHref(id: string, url: string): { href: string; external: boolean } {
  return /^https?:\/\//i.test(url.trim())
    ? { href: url.trim(), external: true }
    : { href: `/news/${id}`, external: false };
}

/**
 * The item's real address on the public web, or null when it has none.
 *
 * `url` is the article itself for feed and followed-link items. For an email
 * item it is synthetic, and canonical_url — the publisher's hosted copy of the
 * issue — is the only real link there is. Null means "nothing worth storing or
 * linking to", which is a better answer than a dead `email://` URL.
 */
export function newsOriginalUrl(url: string, canonicalUrl?: string | null): string | null {
  if (/^https?:\/\//i.test(url.trim())) return url.trim();
  if (canonicalUrl && /^https?:\/\//i.test(canonicalUrl.trim())) return canonicalUrl.trim();
  return null;
}
