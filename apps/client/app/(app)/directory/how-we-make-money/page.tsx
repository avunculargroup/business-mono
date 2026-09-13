import type { Metadata } from 'next';
import Link from 'next/link';
import { requireClientRepositories, readContext } from '@/lib/repositories';
import page from '@/components/Page.module.css';
import styles from '../directory.module.css';

export const metadata: Metadata = { title: 'How we make money' };

/**
 * A route, not a footer.
 *
 * Generated from `commercial_relationships` rather than maintained by hand,
 * which is provenance-first applied to BTS's own revenue. If the table is ever
 * embarrassing to publish, that is the arrangement telling you something —
 * and the page publishing itself is what makes that feedback arrive.
 *
 * Zero-fee arrangements appear here too. A reciprocal referral with no money in
 * it is still a conflict, and "no fee changed hands" is an explanation rather
 * than an exemption.
 */
export default async function HowWeMakeMoneyPage() {
  const repositories = await requireClientRepositories();
  const disclosures = await repositories.directory.disclosures(readContext());

  return (
    <>
      <Link href="/directory" className={page.lede}>
        ← Directory
      </Link>

      <header className={page.header}>
        <h1 className={page.title}>How we make money</h1>
        <p className={page.lede}>
          Minute is paid for by subscriptions and by nothing else. No entity in the directory
          pays to be listed, pays for placement, or pays a referral fee in either direction.
          This page is generated from our own records rather than written by hand.
        </p>
      </header>

      <section className={page.section}>
        <h2 className={page.sectionTitle}>Why there is no referral revenue</h2>
        <p className={page.lede}>
          A register showing the live regulatory status of Australian providers is worth a
          subscription because the providers being tracked are not paying for the privilege.
          Taking their money would make the register worth less than the money. The rule is
          enforced as a database constraint rather than as a policy, so relaxing it is a
          reviewable change rather than a decision someone can quietly take.
        </p>
      </section>

      <section className={page.section}>
        <h2 className={page.sectionTitle}>Arrangements on record</h2>

        {disclosures.length === 0 ? (
          /* An affirmative statement rather than an empty table. "Nothing to
             declare" and "we have not looked" are different sentences, and a
             blank table reads as the second. */
          <p className={page.lede}>
            There are no commercial or reciprocal arrangements on record between Bitcoin
            Treasury Solutions and any entity appearing in Minute.
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Entity</th>
                  <th scope="col">Arrangement</th>
                  <th scope="col">Direction</th>
                  <th scope="col">Fee</th>
                  <th scope="col">Since</th>
                  <th scope="col">What it is</th>
                </tr>
              </thead>
              <tbody>
                {disclosures.map((disclosure, index) => (
                  <tr key={`${disclosure.entityName}-${index}`}>
                    <td>{disclosure.entityName}</td>
                    <td>{disclosure.relationshipType.replace(/_/g, ' ')}</td>
                    <td>{disclosure.direction}</td>
                    <td className={styles.feeBasis}>{disclosure.feeBasis}</td>
                    <td className="mono">{disclosure.startedAt ?? '—'}</td>
                    {/* Verbatim, as authored. Not generated, not templated. */}
                    <td>{disclosure.disclosureText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
