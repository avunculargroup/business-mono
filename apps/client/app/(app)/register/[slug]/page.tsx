import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireClientRepositories, readContext } from '@/lib/repositories';
import page from '@/components/Page.module.css';
import styles from '../register.module.css';

export const metadata: Metadata = { title: 'Register entry' };

/**
 * One register entry.
 *
 * Position, ledger, and stated absences — the third of which is the part that
 * distinguishes this from a data dump. A reader who cannot tell whether an
 * entity has disclosed its custody arrangement is worse off than one told it
 * has not, so absences render as rows rather than as nothing.
 */
export default async function RegisterEntryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const repositories = await requireClientRepositories();
  const entry = await repositories.register.bySlug(readContext(), slug);

  if (!entry) notFound();

  return (
    <>
      <Link href="/register" className={styles.back}>
        ← Register
      </Link>

      <header className={page.header}>
        <h1 className={page.title}>{entry.entityName}</h1>
        <p className={page.lede}>
          {entry.jurisdiction}
          {entry.tickers.length > 0 ? ` · ${entry.tickers.join(' · ')}` : ''}
        </p>
      </header>

      <section className={page.section}>
        <h2 className={page.sectionTitle}>Position</h2>
        {entry.position.length === 0 ? (
          <p className={page.lede}>No position facts are held for this entity.</p>
        ) : (
          <ul className={styles.facts}>
            {entry.position.map((fact, index) => (
              <li key={`${fact.label}-${index}`} className={styles.fact}>
                <span className={styles.factLabel}>{fact.label}</span>
                <span className={styles.factValue}>{fact.value}</span>
                <span className={styles.factDate}>{fact.asAt || 'undated'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {entry.statedAbsences.length > 0 ? (
        <section className={page.section}>
          <h2 className={page.sectionTitle}>Not disclosed</h2>
          <ul className={styles.absences}>
            {entry.statedAbsences.map((absence) => (
              <li key={absence.label} className={styles.absence}>
                <span className={styles.absenceLabel}>{absence.label}</span>
                <span className={styles.absenceReason}>{absence.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={page.section}>
        <h2 className={page.sectionTitle}>Ledger</h2>
        {entry.ledger.length === 0 ? (
          <p className={page.lede}>No events are recorded against this entity.</p>
        ) : (
          <ul className={styles.ledger}>
            {entry.ledger.map((event, index) => (
              <li key={`${event.eventDate}-${index}`} className={styles.event}>
                <span className={styles.eventDate}>{event.eventDate}</span>
                <span className={styles.eventDescription}>{event.description}</span>
                <span className={styles.eventSource}>
                  {event.provenance.sourceName} · {event.provenance.basis}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
