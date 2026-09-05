import Link from 'next/link';
import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ARCHETYPE_LABELS, type Archetype } from '@platform/ui/ArchetypeComparison';
import styles from './research.module.css';

/**
 * The corporate research register.
 *
 * Deliberately not a leaderboard. The genre default — ranked holdings, a large
 * headline number — is the artefact this section was designed to avoid, and for
 * an Authorised Representative it is also the fastest route to publishing
 * something that reads as a view on a listed security. No quantity appears on
 * this page at all: totals live on a company page where a basis chip and a
 * provenance rail can travel with them.
 *
 * Tiers are unequal in depth and non-comparable, so they are separate lists
 * rather than a sortable column.
 */

const TIER_HEADINGS: Record<string, { title: string; blurb: string }> = {
  regional: {
    title: 'Regional register',
    blurb:
      'Every AU, NZ and SG entity with disclosed holdings. Hand-curated and exhaustive. '
      + 'This is the part an Australian CFO is actually asking about: has anyone shaped '
      + 'like me done this, what did their board see, and what broke.',
  },
  peer_shaped: {
    title: 'Peer-shaped',
    blurb:
      'Global companies matched on shape rather than on size — operating business, market '
      + 'capitalisation band, treasury archetype, and how the position was funded.',
  },
  bellwether: {
    title: 'Bellwethers',
    blurb:
      'Read for mechanism and disclosure language only. Their scale makes nothing about '
      + 'their position transferable to a mid-market balance sheet.',
  },
};

const TIER_ORDER = ['regional', 'peer_shaped', 'bellwether'] as const;

export default async function ResearchRegisterPage() {
  const { corporateHoldings } = await getRepositories();
  const { items } = await corporateHoldings.listCompanies(resolveReadContext());

  return (
    <>
      <PageHeader title="Corporate research" />

      <div className={styles.page}>
        <p className={styles.lede}>
          A register of companies holding bitcoin on their balance sheet. It states what was
          disclosed and where it came from. It does not state what it was worth.
        </p>

        {TIER_ORDER.map((tier) => {
          const rows = items.filter((company) => company.tier === tier);
          if (rows.length === 0) return null;

          return (
            <section key={tier} className={styles.tier}>
              <h2 className={styles.tierTitle}>{TIER_HEADINGS[tier].title}</h2>
              <p className={styles.tierBlurb}>{TIER_HEADINGS[tier].blurb}</p>

              <ul className={styles.records}>
                {rows.map((company) => (
                  <li key={company.id} className={styles.record}>
                    <Link href={`/research/${company.slug}`} className={styles.recordLink}>
                      <span className={styles.name}>{company.legalName}</span>
                      <span className={styles.meta}>
                        <span className={styles.archetype}>
                          {ARCHETYPE_LABELS[company.primaryArchetype as Archetype]}
                        </span>
                        {company.selfDescribedArchetype &&
                        company.selfDescribedArchetype !== company.primaryArchetype ? (
                          // The divergence is the case study, so it is visible
                          // from the list rather than only on the record.
                          <span className={styles.diverges}>
                            describes itself as{' '}
                            {ARCHETYPE_LABELS[company.selfDescribedArchetype as Archetype]}
                          </span>
                        ) : null}
                        <span className={styles.jurisdiction}>{company.jurisdiction}</span>
                      </span>
                      <span className={styles.listings}>
                        {company.listings.length === 0
                          ? 'Unlisted'
                          : company.listings
                              .map(
                                (listing) =>
                                  `${listing.venue.toUpperCase()}:${listing.ticker}${
                                    listing.listingType === 'cdi_foreign_exempt'
                                      ? ' (foreign exempt)'
                                      : ''
                                  }`,
                              )
                              .join(' · ')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {items.length === 0 ? (
          <p className={styles.empty}>
            No company has been entered yet. The regional register is seeded by hand — start
            with an entity whose offer document or scheme booklet you can obtain.
          </p>
        ) : null}
      </div>
    </>
  );
}
