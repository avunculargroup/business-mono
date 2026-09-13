import type { Metadata } from 'next';
import Link from 'next/link';
import type { DirectoryEntry } from '@platform/data';
import { DirectoryCard } from '@/components/DirectoryCard';
import { EmptyDay } from '@/components/EmptyDay';
import { requireClientRepositories, readContext } from '@/lib/repositories';
import page from '@/components/Page.module.css';
import styles from './directory.module.css';

export const metadata: Metadata = { title: 'Directory' };

/**
 * Service providers, as neutral factual entries.
 *
 * Not a marketplace and not a shortlist, and the difference is structural
 * rather than worded: grouped by category, sorted neutrally within it, no
 * score, no ranking, no badge that reads as endorsement — and no call to action
 * on anything that is a financial product.
 *
 * The inclusion criteria are on the page rather than in a help doc, because
 * criteria nobody can see are indistinguishable from no criteria.
 */
export default async function DirectoryPage() {
  const repositories = await requireClientRepositories();
  const ctx = readContext();

  const [entries, criteria] = await Promise.all([
    repositories.directory.list(ctx),
    repositories.directory.inclusionCriteria(ctx),
  ]);

  const byCategory = new Map<string, DirectoryEntry[]>();
  for (const entry of entries) {
    byCategory.set(entry.category, [...(byCategory.get(entry.category) ?? []), entry]);
  }

  return (
    <>
      <header className={page.header}>
        <h1 className={page.title}>Directory</h1>
        <p className={page.lede}>
          Providers operating in this market, listed as factual entries. Nothing here is a
          recommendation or a shortlist, and no entity has paid to appear.
        </p>
      </header>

      {/* The standing disclosure line. One of the three required places, and
          the one a subscriber sees without opening anything. */}
      <p className={styles.standingDisclosure}>
        Bitcoin Treasury Solutions receives no fee from any entity listed here, in either
        direction. Where a non-monetary or reciprocal arrangement exists, it is disclosed on
        the entry itself and listed in full at{' '}
        <Link href="/directory/how-we-make-money">how we make money</Link>.
      </p>

      <section className={styles.criteria}>
        <h2 className={styles.criteriaTitle}>How an entity gets listed</h2>
        <ul className={styles.criteriaList}>
          {criteria.map((criterion) => (
            <li key={criterion}>{criterion}</li>
          ))}
        </ul>
      </section>

      {entries.length === 0 ? (
        <EmptyDay
          headline="No entries are available yet"
          detail={
            'Every entry must be assessed against the digital asset platform and tokenised '
            + 'custody platform definitions before it can be listed. Until an entity has been '
            + 'assessed, it does not appear — an unassessed entry is not a safer entry.'
          }
        />
      ) : (
        [...byCategory.entries()].map(([category, categoryEntries]) => (
          <section key={category} className={styles.category}>
            <h2 className={styles.categoryLabel}>{category}</h2>
            <div className={styles.grid}>
              {categoryEntries.map((entry) => (
                <DirectoryCard key={entry.id} entry={entry} />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
