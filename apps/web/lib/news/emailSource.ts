/**
 * Email newsletter source helpers — shared by the source form and the
 * newsSources server action so slug, inbound address, and allowlist parsing
 * stay consistent on both sides.
 */

// The domain newsletters are subscribed at: research+{slug}@<domain>.
// NEXT_PUBLIC_ so the form can render the inbound-address preview client-side;
// the server action reads the same value.
export const RESEARCH_INBOUND_DOMAIN =
  process.env['NEXT_PUBLIC_RESEARCH_INBOUND_DOMAIN'] ?? 'btreasury.com.au';

/** Lowercase, hyphenated, URL/plus-address-safe slug derived from free text. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** The inbound plus-address for a source slug. */
export function computeInboundAddress(slug: string, domain: string = RESEARCH_INBOUND_DOMAIN): string {
  return `research+${slug}@${domain}`;
}

/** Parse a textarea/CSV allowlist into deduped, lowercased entries. */
export function parseSenderAllowlist(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(/[\n,]/)) {
    const entry = part.trim().toLowerCase();
    if (entry) seen.add(entry);
  }
  return [...seen];
}
