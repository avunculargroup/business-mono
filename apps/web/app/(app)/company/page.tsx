import { PageHeader } from '@/components/app-shell/PageHeader';
import { CompanyView } from '@/components/company/CompanyView';
import { getCompanyRecords, getCompanyRecordTypes, getCompanyAssetUrl, getDomains, getSubscriptions } from '@/app/actions/company';

export default async function CompanyPage() {
  const [records, recordTypes, domains, subscriptions] = await Promise.all([
    getCompanyRecords(),
    getCompanyRecordTypes(),
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
