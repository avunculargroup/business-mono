import { notFound } from 'next/navigation';
import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ReadyToPostQueue } from '@/components/campaigns/ReadyToPostQueue';

// Phase 1's payoff — approved, scheduled variants ready to copy out and post by
// hand (v_ready_to_post), with thread segments attached per row. Copy-out,
// copy-by-segment for threads, the attached disclaimer, then mark-as-posted with
// the live URL.

export default async function CampaignQueuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repositories = await getRepositories();

  const queue = await repositories.campaigns.getReadyToPost(resolveReadContext(), id);
  if (!queue) notFound();

  return (
    <>
      <PageHeader
        title={`${queue.campaignName} — ready to post`}
        backHref={`/campaigns/${queue.campaignSlug}`}
        backLabel="Back to campaign"
      />
      <ReadyToPostQueue campaignId={queue.campaignId} items={queue.items} />
    </>
  );
}
