import type { Metadata } from 'next';
import { requireClientRepositories, readContext } from '@/lib/repositories';
import page from '@/components/Page.module.css';
import styles from './account.module.css';

export const metadata: Metadata = { title: 'Account' };

/**
 * Seats, subscription and disclosure history. Deliberately thin.
 *
 * Billing is manual for the MVP: invite-only means every account is onboarded
 * by hand, so a payments integration would be the most expensive way to save
 * the least work. The page says so rather than showing a disabled billing
 * section that implies one is coming next week.
 *
 * There is no "edit" anywhere on this page and there is nothing to edit. Seats
 * are managed by BTS, and the write surface of this app is two methods, neither
 * of which is here.
 */
export default async function AccountPage() {
  const repositories = await requireClientRepositories();
  const ctx = readContext();

  const [subscription, acknowledgements] = await Promise.all([
    repositories.account.subscription(ctx),
    repositories.compliance.acknowledgements(ctx),
  ]);

  return (
    <>
      <header className={page.header}>
        <h1 className={page.title}>Account</h1>
        <p className={page.lede}>
          {subscription?.displayName ?? 'Your account'} — subscription, seats, and what has been
          acknowledged.
        </p>
      </header>

      {subscription ? (
        <>
          <section className={page.section}>
            <h2 className={page.sectionTitle}>Subscription</h2>
            <div className={styles.grid}>
              <div className={styles.row}>
                <span className={styles.label}>Status</span>
                <span className={styles.value}>{subscription.status}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.label}>Type</span>
                <span className={styles.value}>
                  {subscription.clientType === 'smsf' ? 'SMSF' : 'Corporate'}
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.label}>Started</span>
                <span className={styles.value}>{subscription.startedAt ?? '—'}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.label}>Renews</span>
                <span className={styles.value}>{subscription.renewsAt ?? '—'}</span>
              </div>
            </div>
            <p className={styles.note}>
              Invoicing is handled directly rather than through the app. If a renewal date is
              approaching and you have not heard from us, please get in touch.
            </p>
          </section>

          <section className={page.section}>
            <h2 className={page.sectionTitle}>Seats</h2>
            <ul className={styles.seats}>
              {subscription.seats.map((seat) => (
                <li key={seat.email} className={styles.seat}>
                  <span className={styles.seatName}>{seat.fullName}</span>
                  <span className={styles.seatEmail}>{seat.email}</span>
                  <span className={styles.chip}>{seat.role}</span>
                  <span className={styles.chip}>{seat.status}</span>
                </li>
              ))}
            </ul>
            <p className={styles.note}>
              Seats are added and removed by Bitcoin Treasury Solutions. Contact us to change
              who has access.
            </p>
          </section>
        </>
      ) : (
        <p className={styles.note}>Your account details could not be loaded.</p>
      )}

      <section className={page.section}>
        <h2 className={page.sectionTitle}>Disclosures acknowledged</h2>
        {acknowledgements.length === 0 ? (
          <p className={styles.note}>No acknowledgement is recorded against this seat.</p>
        ) : (
          <ul className={styles.seats}>
            {acknowledgements.map((ack) => (
              <li key={ack.documentVersion} className={styles.seat}>
                <span className={styles.seatName}>Financial Services Guide</span>
                <span className={styles.seatEmail}>version {ack.documentVersion}</span>
                <span className={styles.seatEmail}>{ack.acknowledgedAt.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.note}>
          When a new version of the Financial Services Guide is published, you will be asked to
          read it before continuing. Each acknowledgement is recorded against the version you
          were shown.
        </p>
      </section>

      <a href="/logout" className={styles.signOut}>
        Sign out
      </a>
    </>
  );
}
