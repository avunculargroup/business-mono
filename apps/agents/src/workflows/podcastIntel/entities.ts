import type { MentionedCompany } from '@platform/shared';

// A company whose name is this short is almost always a false-positive magnet
// (initialisms, common words), so the gazetteer skips it. Cross-links favour
// precision over recall — a wrong link is worse than a missing one.
const MIN_NAME_LENGTH = 3;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Deterministically match a transcript against known CRM companies (D1: extract,
 * don't guess). A company is "mentioned" when its full name appears as a
 * whole-token, case-insensitive substring — bounded by non-alphanumerics so
 * "Block" doesn't match "Blockchain". Returns the matched companies, de-duped by
 * id, in the order the gazetteer was given.
 *
 * Precision-biased on purpose: only the full stored name matches (no fuzzy or
 * partial matching), because every result becomes a real link into the CRM.
 */
export function extractMentionedCompanies(
  transcript: string | null | undefined,
  companies: MentionedCompany[],
): MentionedCompany[] {
  const text = (transcript ?? '').toLowerCase();
  if (text.trim() === '') return [];

  const seen = new Set<string>();
  const matched: MentionedCompany[] = [];

  for (const company of companies) {
    const name = company.name?.trim().toLowerCase() ?? '';
    if (name.length < MIN_NAME_LENGTH) continue;
    if (seen.has(company.id)) continue;

    // (start-or-non-alphanumeric) NAME (end-or-non-alphanumeric): a whole-token
    // match that tolerates punctuation in the name itself.
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(name)}([^a-z0-9]|$)`, 'i');
    if (pattern.test(text)) {
      seen.add(company.id);
      matched.push({ id: company.id, slug: company.slug, name: company.name });
    }
  }

  return matched;
}
