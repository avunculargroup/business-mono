import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ReadyToPostQueue, type QueueItem } from '@/components/campaigns/ReadyToPostQueue';
import { idColumn } from '@/lib/utils';

// Phase 1's payoff — approved, scheduled variants ready to copy out and post by
// hand (v_ready_to_post), with thread segments fetched per row. Copy-out,
// copy-by-segment for threads, the attached disclaimer, then mark-as-posted with
// the live URL.

export default async function CampaignQueuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: campaign } = await db
    .from('campaigns')
    .select('id, slug, name')
    .eq(idColumn(id), id)
    .maybeSingle();
  if (!campaign) notFound();

  const { data: rows } = await db.from('v_ready_to_post').select('*').eq('campaign_id', campaign.id);
  const items = (rows ?? []) as QueueItem[];

  // Thread segments for the threaded rows (a view can't cleanly nest children).
  const threadIds = items.filter((i) => i.is_thread).map((i) => i.id);
  const segmentsByItem: Record<string, string[]> = {};
  if (threadIds.length > 0) {
    const { data: segs } = await db
      .from('thread_segments')
      .select('content_item_id, sequence, body')
      .in('content_item_id', threadIds)
      .order('sequence', { ascending: true });
    for (const s of (segs ?? []) as Array<{ content_item_id: string; body: string }>) {
      (segmentsByItem[s.content_item_id] ??= []).push(s.body);
    }
  }

  return (
    <>
      <PageHeader title={`${(campaign as { name: string }).name} — ready to post`} backHref={`/campaigns/${campaign.slug}`} backLabel="Back to campaign" />
      <ReadyToPostQueue campaignId={campaign.id} items={items} segmentsByItem={segmentsByItem} />
    </>
  );
}
