import { PageHeader } from '@/components/app-shell/PageHeader';
import { CompanyView } from '@/components/company/CompanyView';
import { LegalIdentitySection } from '@/components/company/LegalIdentitySection';
import { getCompanyRecords, getCompanyRecordTypes, getCompanyAssetUrl, getCompanyProfile, getDomains, getSubscriptions } from '@/app/actions/company';

export default async function CompanyPage() {
  const [records, recordTypes, profile, domains, subscriptions] = await Promise.all([
    getCompanyRecords(),
    getCompanyRecordTypes(),
    getCompanyProfile(),
    getDomains(),
    getSubscriptions(),
  ]);

  const signedUrls: Record<string, string> = {};
  await Promise.all(
    records
      .filter((r) => r.storage_path)
      .map(async (r) => {
        const url = await getCompanyAssetUrl(r.storage_path!);
        if (url) signedUrls[r.id] = url;
      }),
  );

  return (
    <>
      <PageHeader title="Company" />
      <LegalIdentitySection profile={profile} />
      <CompanyView
        records={records}
        recordTypes={recordTypes}
        signedUrls={signedUrls}
        initialDomains={domains}
        initialSubscriptions={subscriptions}
      />
    </>
  );
}
