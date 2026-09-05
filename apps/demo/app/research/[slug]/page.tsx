import { notFound } from 'next/navigation';
import { getRepositories, demoReadContext } from '@/lib/repositories';
import { Page } from '@/components/Page';
import { ProvenanceProvider } from '@platform/ui/ProvenanceRail';
import { ResearchLedger, type LedgerRow } from '@platform/ui/ResearchLedger';
import {
  AbsencePanel,
  FactPanel,
  FreshnessStamp,
  PositionPanel,
  WithheldPanel,
} from '@platform/ui/ResearchPanels';
import styles from '../research.module.css';
import recordStyles from './record.module.css';

/**
 * One record, over fixtures.
 *
 * The provenance rail is rendered permanently open here rather than behind a
 * toggle. In the platform a director toggles it because they already know where
 * a number came from; an evaluator has ninety seconds and the citation is the
 * thing worth seeing, so the demo shows it and the annotation explains why it
 * is there at all.
 */
export default async function DemoResearchRecordPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { corporateHoldings } = getRepositories();
  const ctx = demoReadContext();

  const company = await corporateHoldings.getCompany(ctx, slug);
  if (!company) notFound();

  const [ledger, position, facts, absences, withheld, freshness] = await Promise.all([
    corporateHoldings.getLedger(ctx, company.id),
    corporateHoldings.getPosition(ctx, company.id),
    corporateHoldings.getCompanyFacts(ctx, company.id),
    corporateHoldings.getStructuralAbsences(ctx, company.id),
    corporateHoldings.getWithheldFields(ctx, company.id),
    corporateHoldings.getFreshness(ctx, company.id),
  ]);

  const rows: LedgerRow[] = ledger.items.map((entry) => ({
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

  return (
    <ProvenanceProvider shown>
      <Page title={company.legalName}>
        <div className={recordStyles.record}>
          <FreshnessStamp
            cadence={freshness.expectedDisclosureCadence}
            latestDocumentAt={freshness.latestDocumentAt}
            daysSinceDocument={freshness.daysSinceDocument}
            staleAfterDays={freshness.staleAfterDays}
            isStale={freshness.isStale}
            className={recordStyles.freshness}
          />

          <section className={recordStyles.section} data-annotation-id="holding-basis">
            <h2 className={styles.tierTitle}>Position</h2>
            <PositionPanel
              asset={position.asset}
              comparableTotal={position.comparableTotal}
              rows={position.rows}
              excluded={position.excluded}
            />
          </section>

          <section className={recordStyles.section}>
            <h2 className={styles.tierTitle}>Disclosed ledger</h2>
            <ResearchLedger rows={rows} />
          </section>

          {facts.map((fact) => (
            <section
              key={fact.id}
              className={recordStyles.section}
              data-annotation-id={fact.conflicting ? 'source-conflict' : undefined}
            >
              <FactPanel fact={fact} />
            </section>
          ))}

          {absences.length > 0 ? (
            <section className={recordStyles.section}>
              <h2 className={styles.tierTitle}>Stated absences</h2>
              <AbsencePanel absences={absences} />
            </section>
          ) : null}

          <section className={recordStyles.section} data-annotation-id="withheld-panel">
            <h2 className={styles.tierTitle}>Withheld</h2>
            <WithheldPanel fields={withheld} />
          </section>
        </div>
      </Page>
    </ProvenanceProvider>
  );
}
