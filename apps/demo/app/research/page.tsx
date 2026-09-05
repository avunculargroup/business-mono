import Link from 'next/link';
import { getRepositories, demoReadContext } from '@/lib/repositories';
import { Page } from '@/components/Page';
import { ARCHETYPE_LABELS, type Archetype } from '@platform/ui/ArchetypeComparison';
import styles from './research.module.css';

/**
 * The register, as the demo shows it.
 *
 * The same repository interface the platform uses, over fixtures — so what an
 * evaluator sees here is the real data path with a different adapter behind it,
 * not a mockup that resembles one.
 *
 * There is no holdings number on this page, and its absence is the first thing
 * the annotation layer explains.
 */
const TIER_TITLES: Record<string, string> = {
  regional: 'Regional register',
  peer_shaped: 'Peer-shaped',
  bellwether: 'Bellwethers',
};

const TIER_ORDER = ['regional', 'peer_shaped', 'bellwether'] as const;

export default async function DemoResearchPage() {
  const { corporateHoldings } = getRepositories();
  const { items } = await corporateHoldings.listCompanies(demoReadContext());

  return (
    <Page
      title="Corporate research"
      lede="A register of companies holding bitcoin on their balance sheet, written for Australian CFOs. It states what was disclosed and where it came from. It does not state what it was worth, and there is no headline holdings figure anywhere on this page."
    >
      <div data-annotation-id="no-headline-figure">
        {TIER_ORDER.map((tier) => {
          const rows = items.filter((company) => company.tier === tier);
          if (rows.length === 0) return null;

          return (
            <section key={tier} className={styles.tier}>
              <h2 className={styles.tierTitle}>{TIER_TITLES[tier]}</h2>
              <ul className={styles.records}>
                {rows.map((company) => (
                  <li key={company.id} className={styles.record}>
                    <Link href={`/research/${company.slug}`} className={styles.recordLink}>
                      <span className={styles.name}>{company.legalName}</span>
                      <span
                        className={styles.meta}
                        data-annotation-id={
                          company.selfDescribedArchetype &&
                          company.selfDescribedArchetype !== company.primaryArchetype
                            ? 'archetype-pair'
                            : undefined
                        }
                      >
                        <span>{ARCHETYPE_LABELS[company.primaryArchetype as Archetype]}</span>
                        {company.selfDescribedArchetype &&
                        company.selfDescribedArchetype !== company.primaryArchetype ? (
                          <span className={styles.diverges}>
                            describes itself as{' '}
                            {ARCHETYPE_LABELS[
                              company.selfDescribedArchetype as Archetype
                            ].toLowerCase()}
                          </span>
                        ) : null}
                        <span className={styles.jurisdiction}>{company.jurisdiction}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Page>
  );
}
