// ============================================================
// Licence codes — every source's spelling, mapped to paper_licences.code
// ============================================================
// paper_locations.licence is a foreign key to paper_licences, so a code that
// is not seeded there fails the commit. Anything unrecognised but stated as
// open becomes 'other-oa' (link out until someone reads it); anything not
// stated is null. Neither can ever be rehosted.

export const KNOWN_LICENCES = new Set([
  'cc-by', 'cc-by-sa', 'cc0', 'public-domain', 'cc-by-nd', 'cc-by-nc', 'cc-by-nc-sa', 'cc-by-nc-nd',
  'arxiv-default', 'publisher-specific-oa', 'implied-oa', 'other-oa',
]);

/** OpenAlex's location `license` value → code. */
export function fromOpenAlex(licence: string | null | undefined): string | null {
  if (!licence) return null;
  const l = licence.toLowerCase().trim();
  if (KNOWN_LICENCES.has(l)) return l;
  if (l === 'pd' || l === 'public domain') return 'public-domain';
  return 'other-oa';
}

/**
 * A licence URL (Crossref deposits, arXiv) → code. Versions and ports of a CC
 * licence carry the same terms, so only the element list matters.
 */
export function fromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.toLowerCase();
  if (/creativecommons\.org\/publicdomain\/zero/.test(u)) return 'cc0';
  if (/creativecommons\.org\/publicdomain\/mark/.test(u)) return 'public-domain';
  const cc = /creativecommons\.org\/licenses\/([a-z-]+)/.exec(u);
  if (cc) {
    const code = `cc-${cc[1]}`;
    return KNOWN_LICENCES.has(code) ? code : 'other-oa';
  }
  if (/arxiv\.org\/licenses\/nonexclusive-distrib/.test(u)) return 'arxiv-default';
  if (/elsevier\.com\/(tdm|open-access\/userlicense)|springer\.com\/tdm|wiley\.com\/onlinelibrary\/tdm|tandfonline\.com\/action\/showcopyright/.test(u)) {
    return 'publisher-specific-oa';
  }
  return 'other-oa';
}

/** EPrints `license` field values (e.g. cc_by_nc_nd_4) → code. */
export function fromEprints(licence: string | null | undefined): string | null {
  if (!licence) return null;
  const l = licence.toLowerCase();
  const cc = /^cc_(by(?:_nc)?(?:_nd|_sa)?)(?:_\d+)?$/.exec(l);
  if (cc) return `cc-${cc[1].replace(/_/g, '-')}`;
  if (l === 'cc_public_domain' || l === 'cc0') return 'cc0';
  // e.g. 'accepted_manuscript', 'publisher_copyright': free to read, no reuse licence.
  return null;
}
