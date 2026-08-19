import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Send } from 'lucide-react';
import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { CampaignWorkspace } from '@/components/campaigns/CampaignWorkspace';
import { CampaignMatrix } from '@/components/campaigns/CampaignMatrix';
import { PublishedPosts } from '@/components/campaigns/PublishedPosts';
import styles from '../campaigns.module.css';

// Campaign detail / canvas. Renders the strategy summary and drives the two
// review gates (strategy, plan) when the workflow is suspended on this campaign.
// After plan approval it collapses to a locked read-only canvas.

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repositories = await getRepositories();

  // The beats, matrix and published posts only exist once the plan is approved.
  // Working that out — and issuing the three reads it implies — is the
  // repository's; the page reads `planLocked` rather than deriving it.
  const campaign = await repositories.campaigns.getDetail(resolveReadContext(), id);
  if (!campaign) notFound();

  return (
    <>
      <PageHeader title={campaign.name} backHref="/campaigns">
        {campaign.matrix.length > 0 && (
          <Link href={`/campaigns/${campaign.slug}/queue`} className={styles.queueLink}>
            <Send size={16} strokeWidth={1.5} />
            Ready to post
          </Link>
        )}
      </PageHeader>
      <div className={styles.detailStack}>
        <CampaignWorkspace campaign={campaign} beats={campaign.beats} />
        <CampaignMatrix rows={campaign.matrix} />
        <PublishedPosts items={campaign.published} campaignId={campaign.id} />
      </div>
    </>
  );
}
