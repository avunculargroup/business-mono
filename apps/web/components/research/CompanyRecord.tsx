'use client';

import { useState } from 'react';
import Link from 'next/link';
import type {
  CompanyDossier,
  CompanyFact,
  FreshnessRow,
  JurisdictionNote,
  LedgerEntry,
  PositionSummary,
  StructuralAbsence,
  WithheldField,
} from '@platform/data';
import { ProvenanceProvider, ProvenanceToggle } from '@platform/ui/ProvenanceRail';
import { ResearchLedger, type LedgerRow } from '@platform/ui/ResearchLedger';
import {
  AbsencePanel,
  FactPanel,
  FreshnessStamp,
  PositionPanel,
  WithheldPanel,
} from '@platform/ui/ResearchPanels';
import { ARCHETYPE_LABELS, type Archetype } from '@platform/ui/ArchetypeComparison';
import styles from './CompanyRecord.module.css';

/**
 * One company's record.
 *
 * Client-side only because of the provenance toggle, which is the page's single
 * piece of state. Everything else is passed in already read.
 *
 * There is no headline holdings number at the top of this page, and its absence
 * is the design. Three research records produced three unrelated mechanisms by
 * which a stated bitcoin figure overstates a corporate position — wrong
 * secondary sources, look-through into a related fund, and customer assets
 * custodied alongside treasury — so a figure that arrives without its basis and
 * its source is worse than no figure. The position appears further down, with
 * both attached.
 */
export function CompanyRecord({
  company,
  ledger,
  position,
  facts,
  absences,
  withheld,
  freshness,
  notes,
}: {
  company: CompanyDossier;
  ledger: LedgerEntry[];
  position: PositionSummary;
  facts: CompanyFact[];
  absences: StructuralAbsence[];
  withheld: WithheldField[];
  freshness: FreshnessRow;
  notes: JurisdictionNote[];
}) {
  const [showSources, setShowSources] = useState(true);

  const rows: LedgerRow[] = ledger.map((entry) => ({
    id: entry.id,
    eventDate: entry.eventDate,
    eventType: entry.eventType,
    headline: entry.headline,
    detail: entry.detail,
    quantity: entry.quantity,
    assetClass: entry.assetClass,
    considerationNative: entry.considerationNative,
    nativeCurrency: entry.nativeCurrency,
    considerationAud: entry.considerationAud,
    fxRateUsed: entry.fxRateUsed,
    feesIncluded: entry.feesIncluded,
    basis: entry.basis,
    basisComparable: entry.basisComparable,
    classification: entry.classification,
    provenance: entry.provenance,
  }));

  const currentListings = company.listings
    .map((listing) => `${listing.venue.toUpperCase()}:${listing.ticker}`)
    .join(' · ');
  const formerListings = company.listingHistory.filter((listing) => listing.listedTo !== null);

  return (
    <ProvenanceProvider shown={showSources}>
      <div className={styles.page}>
        <header className={styles.mast}>
          <p className={styles.eyebrow}>
            {company.tier.replace(/_/g, '-')} · {company.jurisdiction}
          </p>

          {/* Rule 3, at the top of the page. A reader searching the current
              ticker would find nothing filed before the rename, and the
              register says so rather than quietly presenting a partial history. */}
          {company.formerNames.length > 0 || formerListings.length > 0 ? (
            <p className={styles.former}>
              {company.formerNames.map((name) => (
                <span key={name.name}>
                  Formerly <strong>{name.name}</strong>
                  {name.usedTo ? ` to ${name.usedTo}` : ''}.{' '}
                </span>
              ))}
              {formerListings.map((listing) => (
                <span key={`${listing.venue}-${listing.ticker}-${listing.listedFrom}`}>
                  Previously <code>{listing.venue.toUpperCase()}:{listing.ticker}</code>
                  {listing.listedTo ? ` to ${listing.listedTo}` : ''}.{' '}
                </span>
              ))}
              Filings before a rename sit under the old name, so a lookup keyed on the
              current one loses them.
            </p>
          ) : null}

          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>Archetype</dt>
              <dd>
                {ARCHETYPE_LABELS[company.primaryArchetype as Archetype]}
                {company.selfDescribedArchetype &&
                company.selfDescribedArchetype !== company.primaryArchetype ? (
                  <em>
                    Describes itself as{' '}
                    {ARCHETYPE_LABELS[company.selfDescribedArchetype as Archetype].toLowerCase()}
                  </em>
                ) : null}
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>Listing</dt>
              <dd>
                {currentListings || 'Unlisted'}
                {company.listings.some((l) => l.listingType === 'cdi_foreign_exempt') ? (
                  <em>Foreign exempt — outside most of that venue&rsquo;s listing rules</em>
                ) : null}
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>Reporting</dt>
              <dd>
                {company.reportingStandard ?? 'Not stated'}
                {company.functionalCurrency &&
                company.presentationCurrency &&
                company.functionalCurrency !== company.presentationCurrency ? (
                  <em>
                    Operates in {company.functionalCurrency}, reports in{' '}
                    {company.presentationCurrency}
                  </em>
                ) : null}
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>Registration</dt>
              <dd className={styles.mono}>
                {company.acn ?? company.arbn ?? company.abn ?? company.isin ?? 'Not recorded'}
                <em>Resolution runs on this, never on a ticker</em>
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>Disclosure</dt>
              <dd>{company.expectedDisclosureCadence}</dd>
            </div>
          </dl>

          <FreshnessStamp
            cadence={freshness.expectedDisclosureCadence}
            latestDocumentAt={freshness.latestDocumentAt}
            daysSinceDocument={freshness.daysSinceDocument}
            staleAfterDays={freshness.staleAfterDays}
            isStale={freshness.isStale}
            className={styles.freshness}
          />
        </header>

        <div className={styles.provbar}>
          <p>
            Every figure on this page carries the document it came from and the class of that
            document. Three research records produced three unrelated ways a stated figure
            overstates a corporate position.
          </p>
          <ProvenanceToggle shown={showSources} onChange={setShowSources} />
        </div>

        <div className={styles.cols}>
          <main className={styles.main}>
            <section className={styles.section}>
              <h2 className={styles.h2}>Position</h2>
              <PositionPanel
                asset={position.asset}
                comparableTotal={position.comparableTotal}
                rows={position.rows}
                excluded={position.excluded}
              />
            </section>

            <section className={styles.section}>
              <h2 className={styles.h2}>Disclosed ledger</h2>
              <ResearchLedger rows={rows} />
            </section>

            {absences.length > 0 ? (
              <section className={styles.section}>
                <h2 className={styles.h2}>Stated absences</h2>
                <p className={styles.sublede}>
                  Facts this record can state because they are missing. An empty panel and a
                  company with no debt look identical on a screen, and only one of them is an
                  answer.
                </p>
                <AbsencePanel absences={absences} />
              </section>
            ) : null}
          </main>

          <aside className={styles.aside}>
            {facts.map((fact) => (
              <section key={fact.id} className={styles.section}>
                <FactPanel fact={fact} />
              </section>
            ))}

            {notes.length > 0 ? (
              <section className={styles.section}>
                <h2 className={styles.h2}>Jurisdiction</h2>
                <ul className={styles.noteList}>
                  {notes.map((note) => (
                    <li key={note.id}>
                      <Link href="/research/jurisdictions">{note.title}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className={styles.section}>
              <h2 className={styles.h2}>Withheld</h2>
              <WithheldPanel fields={withheld} />
            </section>

            {company.curatorNotes ? (
              <section className={styles.section}>
                <h2 className={styles.h2}>Curator notes</h2>
                <p className={styles.curator}>{company.curatorNotes}</p>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </ProvenanceProvider>
  );
}
