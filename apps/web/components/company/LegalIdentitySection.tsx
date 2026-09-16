import Link from 'next/link';
import type { CompanyProfileValues } from '@/app/actions/company';
import type { ProfileField } from '@/lib/compliance/documents';
import styles from './LegalIdentitySection.module.css';

/**
 * The `company_profile` singleton, read-only, on the page people think to look
 * at when they want the company's ABN.
 *
 * Read-only because there is exactly one form for these values and it lives at
 * `/compliance`, next to the Service Statement that will not render without
 * them. Two forms writing one singleton is the shape this section exists to
 * retire: until migration `20260916000000`, five of these fields were also
 * `company_records` rows editable from this page.
 */

type Group = { label: string; fields: ProfileField[] };

const GROUPS: readonly Group[] = [
  { label: 'Registration', fields: ['legal_name', 'trading_name', 'abn', 'acn'] },
  {
    label: 'Registered office',
    fields: ['registered_address', 'registered_state', 'registered_postcode'],
  },
  {
    label: 'Public contact',
    fields: ['public_phone', 'public_email', 'public_website', 'privacy_policy_url'],
  },
  {
    label: 'Complaints',
    fields: ['complaints_contact', 'complaints_email', 'complaints_phone'],
  },
];

const LABELS: Record<ProfileField, string> = {
  legal_name: 'Legal name',
  trading_name: 'Trading name',
  abn: 'ABN',
  acn: 'ACN',
  registered_address: 'Address',
  registered_state: 'State',
  registered_postcode: 'Postcode',
  public_phone: 'Phone',
  public_email: 'Email',
  public_website: 'Website',
  complaints_contact: 'Contact',
  complaints_email: 'Email',
  complaints_phone: 'Phone',
  privacy_policy_url: 'Privacy policy',
};

const NUMERIC: readonly ProfileField[] = ['abn', 'acn', 'registered_postcode'];

export function LegalIdentitySection({ profile }: { profile: CompanyProfileValues | null }) {
  return (
    <section className={styles.section} aria-labelledby="legal-identity-heading">
      <div className={styles.header}>
        <h2 id="legal-identity-heading" className={styles.heading}>
          Legal identity
        </h2>
        <Link href="/compliance" className={styles.editLink}>
          Edit on Compliance
        </Link>
      </div>

      {profile === null ? (
        <p className={styles.empty}>
          Nothing recorded yet. The Service Statement subscribers acknowledge is built from
          these values, so it stays unavailable until they are filled in on Compliance.
        </p>
      ) : (
        <div className={styles.groups}>
          {GROUPS.map((group) => (
            <div key={group.label}>
              <h3 className={styles.groupLabel}>{group.label}</h3>
              <dl className={styles.fields}>
                {group.fields.map((field) => {
                  const value = profile[field]?.trim();
                  return (
                    <div key={field} className={styles.field}>
                      <dt className={styles.fieldLabel}>{LABELS[field]}</dt>
                      <dd
                        className={[
                          styles.fieldValue,
                          value && NUMERIC.includes(field) ? styles.numeric : '',
                          value ? '' : styles.unset,
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {value || 'Not set'}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
