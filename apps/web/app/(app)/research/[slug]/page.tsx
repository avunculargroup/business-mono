import { notFound } from 'next/navigation';
import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { PageHeader } from '@/components/app-shell/PageHeader';
import styles from '../research.module.css';
import { CompanyRecord } from '@/components/research/CompanyRecord';
import { RegisterClearance } from '@/components/clientGate/RegisterClearance';

/**
 * One company's record.
 *
 * Every read the page makes is a repository call, and all eight run in parallel
 * — they are independent, and serialising them would make the page as slow as
 * their sum for no reason. The interactive parts (the provenance toggle) live
 * in `CompanyRecord`, which is a client component; this stays a data-wiring
 * shell so its test asserts the reads rather than the toggle.
 */
/** Draft rows grouped by the run that wrote them, hand-written ones last. */
function groupDrafts(
  rows: Array<{ reviewState: string; ingestRunId: string | null }>,
): Array<{ runId: string | null; rows: number }> {
  const counts = new Map<string | null, number>();
  for (const row of rows) {
    if (row.reviewState !== 'draft') continue;
    counts.set(row.ingestRunId, (counts.get(row.ingestRunId) ?? 0) + 1);
  }
  return [...counts]
    .map(([runId, count]) => ({ runId, rows: count }))
    .sort((a, b) => (a.runId === null ? 1 : b.runId === null ? -1 : a.runId.localeCompare(b.runId)));
}

export default async function ResearchCompanyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { corporateHoldings } = await getRepositories();
  const ctx = resolveReadContext();

  const company = await corporateHoldings.getCompany(ctx, slug);
  if (!company) notFound();

  const [ledger, position, facts, absences, withheld, freshness, notes] = await Promise.all([
    // The reviewer's view: draft rows included, and marked as drafts.
    corporateHoldings.getLedger(ctx, company.id, { includeDrafts: true }),
    corporateHoldings.getPosition(ctx, company.id),
    corporateHoldings.getCompanyFacts(ctx, company.id, { includeDrafts: true }),
    corporateHoldings.getStructuralAbsences(ctx, company.id, { includeDrafts: true }),
    corporateHoldings.getWithheldFields(ctx, company.id),
    corporateHoldings.getFreshness(ctx, company.id),
    corporateHoldings.getJurisdictionNotes(ctx, {
      standard: company.reportingStandard ?? undefined,
      venue: company.listings[0]?.venue,
      listingType: company.listings[0]?.listingType,
    }),
  ]);

  return (
    <>
      <PageHeader title={company.legalName} backHref="/research" backLabel="Register" />
      {/* Above the record rather than buried in it: whether a paying subscriber
          sees this entry is a decision about the whole page, not a field on it. */}
      <div className={styles.gateWrap}>
        <RegisterClearance
          companyId={company.id}
          reviewState={company.reviewState}
          cleared={company.clientCleared}
          clientSummary={company.clientSummary}
          draftGroups={groupDrafts([
            ...ledger.items,
            ...absences,
            // The ingest writes no facts, so a draft fact is always by hand.
            ...facts.map((fact) => ({ ...fact, ingestRunId: null })),
          ])}
        />
      </div>
      <CompanyRecord
        company={company}
        ledger={ledger.items}
        position={position}
        facts={facts}
        absences={absences}
        withheld={withheld}
        freshness={freshness}
        notes={notes}
      />
    </>
  );
}
