'use client';

import { useState, useTransition } from 'react';
import { saveCompanyProfile } from '@/app/actions/complianceDocuments';
import { PROFILE_FIELDS, REQUIRED_PROFILE_FIELDS, type ProfileField } from '@/lib/compliance/documents';
import styles from './compliance.module.css';

const LABELS: Record<ProfileField, string> = {
  legal_name: 'Legal name',
  trading_name: 'Trading name',
  abn: 'ABN',
  acn: 'ACN',
  registered_address: 'Registered address',
  registered_state: 'State',
  registered_postcode: 'Postcode',
  public_phone: 'Public phone',
  public_email: 'Public email',
  public_website: 'Public website',
  complaints_contact: 'Complaints contact',
  complaints_email: 'Complaints email',
  complaints_phone: 'Complaints phone',
};

/**
 * The `company_profile` singleton, as a form.
 *
 * Thirteen fields, and the Service Statement uses all thirteen — so this is
 * not settings, it is the gate's prerequisite. A single blank field here means
 * every subscriber sees "the Service Statement is not available" instead of the
 * document.
 */
export function CompanyProfileForm({
  initial,
  usedBy,
}: {
  initial: Partial<Record<ProfileField, string | null>> | null;
  /** Fields the active or pending Service Statement actually references. */
  usedBy: ProfileField[];
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(PROFILE_FIELDS.map((f) => [f, initial?.[f] ?? ''])),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await saveCompanyProfile(values);
      if (result.error) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <form className={styles.profileForm} onSubmit={submit}>
      <div className={styles.profileGrid}>
        {PROFILE_FIELDS.map((field) => {
          const blank = values[field]?.trim() === '';
          const needed = usedBy.includes(field);

          return (
            <div key={field} className={styles.profileField}>
              <label className={styles.label} htmlFor={`profile-${field}`}>
                {LABELS[field]}
                {REQUIRED_PROFILE_FIELDS.includes(field) && (
                  <span className={styles.requiredMark} aria-hidden="true">
                    {' '}
                    ·required
                  </span>
                )}
              </label>
              <input
                id={`profile-${field}`}
                className={styles.input}
                value={values[field] ?? ''}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, [field]: event.target.value }))
                }
                aria-describedby={blank && needed ? `blocks-${field}` : undefined}
              />
              {blank && needed && (
                <p id={`blocks-${field}`} className={styles.blocksGate}>
                  Blank — the Service Statement uses this
                </p>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className={styles.saved} role="status">
          Profile saved.
        </p>
      )}

      <button type="submit" className={styles.primaryButton} disabled={pending}>
        {pending ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  );
}
