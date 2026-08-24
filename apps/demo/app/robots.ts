import type { MetadataRoute } from 'next';

/**
 * Disallow crawling, everywhere.
 *
 * Belt and braces with the `noindex` meta tag in `layout.tsx`, and not
 * redundant with it: a meta tag is only seen by a crawler that has already
 * fetched the page, while this stops well-behaved ones earlier. The failure
 * mode being closed has real teeth — a client or counterparty searching for BTS
 * and landing on fabricated, client-shaped records under BTS branding.
 *
 * Indexing was allowed in the original spec on the grounds that being findable
 * is the point. Settled the other way: passive search discovery is the least
 * valuable channel for a link pasted into an application, so disallowing it
 * costs almost nothing and removes the one failure mode that matters.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: '/' },
  };
}
