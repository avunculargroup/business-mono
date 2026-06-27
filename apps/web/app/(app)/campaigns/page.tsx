import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { CampaignsList, type OverviewRow } from '@/components/campaigns/CampaignsList';
import styles from './campaigns.module.css';

// Campaigns list — progress + timeline per campaign, from v_campaign_overview.
// The strategy layer's home; "New campaign" opens the creation wizard. Live
// status updates are handled by the client CampaignsList wrapper.

export default async function CampaignsPage() {
  const supabase = await createClient();
  // v_campaign_overview isn't in the generated web types until db:generate-types
  // runs post-migration — cast at the boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('v_campaign_overview')
    .select('*');
  const campaigns = (data ?? []) as OverviewRow[];

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
