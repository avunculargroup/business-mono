import type { CompanyIdentifier } from '@platform/data';

const SCHEME_LABELS: Record<string, string> = {
  acn: 'ACN',
  abn: 'ABN',
  arbn: 'ARBN',
  isin: 'ISIN',
  lei: 'LEI',
  sec_cik: 'SEC CIK',
  iom_company_number: 'IoM company no.',
  sedar_profile: 'SEDAR+ profile',
};

/**
 * A dossier's registration numbers as one line. Every identifier is shown —
 * a company with two CIKs has two, and picking one would hide the half of its
 * history filed under the other. A superseded one says when it stopped.
 */
export function formatIdentifiers(identifiers: CompanyIdentifier[]): string {
  if (identifiers.length === 0) return 'Not recorded';
  return identifiers
    .map((id) => {
      const label = SCHEME_LABELS[id.scheme] ?? id.scheme.replace(/_/g, ' ');
      return id.validTo ? `${label} ${id.value} (to ${id.validTo})` : `${label} ${id.value}`;
    })
    .join(' · ');
}
