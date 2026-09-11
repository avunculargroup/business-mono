import type { Metadata } from 'next';
import Link from 'next/link';
import type { ClientRegisterEntry } from '@platform/data';
import { EmptyDay } from '@/components/EmptyDay';
import { requireClientRepositories, readContext } from '@/lib/repositories';
import page from '@/components/Page.module.css';
import styles from './register.module.css';

export const metadata: Metadata = { title: 'Register' };

/**
 * The corporate register, scoped to entries cleared for client distribution.
 *
 * Grouped by tier, and no holdings figure on the list page — consistent with
 * the internal `/research`. A list of names with quantities beside them invites
 * exactly the comparison the register rules forbid, and a reader who wants the
 * position can open the entry, where it arrives with its basis and its date.
 *
 * Tiers are rendered in whatever order the data gives them, which is
 * alphabetical by entity within tier. No ranking, because a ranking is a view.
 */
export default async function RegisterPage() {
  const repositories = await requireClientRepositories();
  const entries = await repositories.register.list(readContext());

  const byTier = new Map<string, ClientRegisterEntry[]>();
  for (const entry of entries) {
    byTier.set(entry.tier, [...(byTier.get(entry.tier) ?? []), entry]);
  }

  return (
    <>
      <header className={page.header}>
        <h1 className={page.title}>Register</h1>
        <p className={page.lede}>
          Entities that have disclosed a bitcoin position, as reported. Every figure carries
          its basis and the date it was true. Where something has not been disclosed, the entry
          says so rather than leaving a gap.
        </p>
      </header>

      {entries.length === 0 ? (
        <EmptyDay
          headline="No entries are cleared for distribution"
          detail={
            'The register holds entries, and none has yet been cleared for distribution to '
            + 'subscribers. Clearing is a human decision taken per entry.'
          }
        />
      ) : (
        [...byTier.entries()].map(([tier, tierEntries]) => (
          <section key={tier} className={styles.tier}>
            <h2 className={styles.tierLabel}>{tier}</h2>
            <ul className={styles.list}>
              {tierEntries.map((entry) => (
                <li key={entry.slug} className={styles.row}>
                  <Link href={`/register/${entry.slug}`} className={styles.link}>
                    <span className={styles.name}>{entry.entityName}</span>
                    <span className={styles.jurisdiction}>{entry.jurisdiction}</span>
                    {/* Ticker is never a key — display only, and an entity may
                        have none, in which case nothing is rendered. */}
                    {entry.tickers.length > 0 ? (
                      <span className={styles.tickers}>{entry.tickers.join(' · ')}</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
