/**
 * Normalises what someone types into the paywalled-sites field — a bare host,
 * a www. host, or a pasted article URL — into the bare lowercase domain that
 * paywalled_domains stores. The pattern matches the table's CHECK, so a value
 * that passes here will not be rejected by the database.
 */
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function normalizePaywalledDomain(raw: string): { domain: string } | { error: string } {
  let value = raw.trim().toLowerCase();
  if (!value) return { error: 'Enter a site, such as bloomberg.com.' };

  if (/^[a-z]+:\/\//.test(value)) {
    try {
      value = new URL(value).hostname;
    } catch {
      return { error: 'That link could not be read. Enter the site, such as bloomberg.com.' };
    }
  } else {
    value = value.split(/[/?#]/)[0]!.replace(/:\d+$/, '');
  }
  value = value.replace(/^www\./, '').replace(/\.$/, '');

  if (!DOMAIN_RE.test(value)) return { error: 'Enter a site, such as bloomberg.com.' };
  return { domain: value };
}
