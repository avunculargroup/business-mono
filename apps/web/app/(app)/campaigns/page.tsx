import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { CampaignsList } from '@/components/campaigns/CampaignsList';
import styles from './campaigns.module.css';

// Campaigns list — progress + timeline per campaign, from v_campaign_overview.
// The strategy layer's home; "New campaign" opens the creation wizard. Live
// status updates are handled by the client CampaignsList wrapper.

export default async function CampaignsPage() {
  const repositories = await getRepositories();
  const campaigns = await repositories.campaigns.listOverview(resolveReadContext());

  return (
    <>
      <PageHeader title="Campaigns">
        <Link href="/campaigns/new" className={styles.newButton}>
          <Plus size={16} strokeWidth={1.5} />
          New campaign
        </Link>
      </PageHeader>

      <CampaignsList initialCampaigns={campaigns} />
    </>
  );
}
