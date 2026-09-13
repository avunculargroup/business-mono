import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CiteInAPack } from './CiteInAPack';
import { requireClientRepositories, readContext } from '@/lib/repositories';
import page from '@/components/Page.module.css';
import styles from '../register.module.css';

export const metadata: Metadata = { title: 'Register entry' };

/**
 * One register entry.
 *
 * **Implementation facts, not outcome facts.** How this entity did it — which
 * standard, which custody model, what authority, how it was disclosed and when.
 * Never how it went for them: no current value, no unrealised gain, no share
 * price since announcement. The filter is an RLS policy reading
 * `field_source_minimums.client_fact_class`, so a fact that should not be here
 * never reaches the page.
 *
 * Every fact row carries **Cite in a pack**, which is what makes that purpose
 * legible from the interface. Someone using this page is building a case, not
 * browsing holdings, and the action says so more clearly than a paragraph
 * explaining it would.
 *
 * Stated absences render as rows rather than as nothing: a reader who cannot
 * tell whether an entity disclosed its custody arrangement is worse off than
 * one told it did not.
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
        <h2 className={page.sectionTitle}>How they did it</h2>
        <p className={styles.sectionNote}>
          Implementation facts — the accounting standard, the custody model, the authority
          relied on and how it was disclosed. This register does not carry current values,
          unrealised gains or share prices: how it went for them is a different question about
          a different asset.
        </p>
        {entry.position.length === 0 ? (
          <p className={page.lede}>No implementation facts are held for this entity.</p>
        ) : (
          <ul className={styles.facts}>
            {entry.position.map((fact, index) => (
              <li key={`${fact.label}-${index}`} className={styles.fact}>
                <span className={styles.factLabel}>{fact.label}</span>
                <span className={styles.factValue}>{fact.value}</span>
                <span className={styles.factDate}>{fact.asAt || 'undated'}</span>
                <CiteInAPack
                  fact={{
                    // The same `Fact` shape a bound fact carries, so a citation
                    // renders in the pack exactly as a template-bound one does.
                    key: `register:${entry.slug}:${index}`,
                    label: fact.label,
                    value: fact.value,
                    asAt: fact.asAt,
                    sourceName: entry.provenance[0]?.sourceName ?? 'Corporate register',
                    basis: 'reported',
                    complianceClass: 'neutral',
                  }}
                  entitySlug={entry.slug}
                  entityName={entry.entityName}
                />
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
