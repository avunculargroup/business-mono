import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { CampaignWizard, type WizardAccount } from '@/components/campaigns/CampaignWizard';

// Campaign creation wizard — objective & audience → accounts & cadence → launch
// the strategy workflow, which then suspends at the two review gates on the
// campaign detail page.

export default async function NewCampaignPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('social_accounts')
    .select('id, platform, account_type, display_name')
    .eq('is_active', true)
    .order('display_name', { ascending: true });

  const accounts = ((data ?? []) as WizardAccount[]) ?? [];

  return (
    <>
      <PageHeader title="New campaign" />
      <CampaignWizard accounts={accounts} />
    </>
  );
}
