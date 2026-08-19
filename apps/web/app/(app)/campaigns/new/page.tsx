import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { CampaignWizard } from '@/components/campaigns/CampaignWizard';

// Campaign creation wizard — objective & audience → accounts & cadence → launch
// the strategy workflow, which then suspends at the two review gates on the
// campaign detail page.

export default async function NewCampaignPage() {
  const repositories = await getRepositories();
  const accounts = await repositories.campaigns.listAccounts(resolveReadContext());

  return (
    <>
      <PageHeader title="New campaign" />
      <CampaignWizard accounts={accounts} />
    </>
  );
}
