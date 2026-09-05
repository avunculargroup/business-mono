import { notFound } from 'next/navigation';
import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { CompanyRecord } from '@/components/research/CompanyRecord';

/**
 * One company's record.
 *
 * Every read the page makes is a repository call, and all eight run in parallel
 * — they are independent, and serialising them would make the page as slow as
 * their sum for no reason. The interactive parts (the provenance toggle) live
 * in `CompanyRecord`, which is a client component; this stays a data-wiring
 * shell so its test asserts the reads rather than the toggle.
 */
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
    corporateHoldings.getLedger(ctx, company.id),
    corporateHoldings.getPosition(ctx, company.id),
    corporateHoldings.getCompanyFacts(ctx, company.id),
    corporateHoldings.getStructuralAbsences(ctx, company.id),
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
