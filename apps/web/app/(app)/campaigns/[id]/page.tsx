import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Send } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { CampaignWorkspace, type CampaignRow, type BeatRow } from '@/components/campaigns/CampaignWorkspace';
import { CampaignMatrix, type MatrixRow } from '@/components/campaigns/CampaignMatrix';
import { PublishedPosts, type PublishedItem } from '@/components/campaigns/PublishedPosts';
import styles from '../campaigns.module.css';

// Campaign detail / canvas. Renders the strategy summary and drives the two
// review gates (strategy, plan) when the workflow is suspended on this campaign.
// After plan approval it collapses to a locked read-only canvas.

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // campaign gate columns aren't in the generated web types until db:generate-types
  // runs post-migration — cast at the boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data } = await db
    .from('campaigns')
    .select(
      'id, name, objective, status, strategy, schedule_plan, gate_state, pending_decision, workflow_run_id',
    )
    .eq('id', id)
    .maybeSingle();
  if (!data) notFound();
  const campaign = data as CampaignRow;

  // Once the plan is approved the beats live in campaign_beats — load them for
  // the locked canvas, plus the variant matrix (v_campaign_matrix). Before then
  // they live transiently in gate_state and no variants exist yet.
  const planLocked =
    campaign.status === 'plan_approved' || campaign.status === 'active' || campaign.status === 'completed';
  let beats: BeatRow[] = [];
  let matrix: MatrixRow[] = [];
  let published: PublishedItem[] = [];
  if (planLocked) {
    const [{ data: beatData }, { data: matrixData }, { data: publishedData }] = await Promise.all([
      db
        .from('campaign_beats')
        .select('id, sequence, title, core_message, rationale, prefer_thread')
        .eq('campaign_id', id)
        .order('sequence', { ascending: true }),
      db.from('v_campaign_matrix').select('*').eq('campaign_id', id),
      db
        .from('content_items')
        .select(
          'id, title, body, type, is_thread, published_url, social_accounts(display_name), post_metrics(impressions, reactions, comments, reposts, clicks)',
        )
        .eq('campaign_id', id)
        .eq('status', 'published')
        .order('published_at', { ascending: false }),
    ]);
    beats = (beatData ?? []) as BeatRow[];
    matrix = (matrixData ?? []) as MatrixRow[];
    // Flatten the nested account + metrics relations into the component shape.
    published = (
      (publishedData ?? []) as Array<{
        id: string;
        title: string | null;
        body: string | null;
        type: 'linkedin' | 'twitter_x';
        is_thread: boolean;
        published_url: string | null;
        social_accounts: { display_name: string | null } | null;
        post_metrics: PublishedItem['metrics'] | PublishedItem['metrics'][] | null;
      }>
    ).map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      type: r.type,
      is_thread: r.is_thread,
      published_url: r.published_url,
      account_name: r.social_accounts?.display_name ?? null,
      metrics: Array.isArray(r.post_metrics) ? (r.post_metrics[0] ?? null) : r.post_metrics,
    }));
  }

  return (
    <>
      <PageHeader title={campaign.name} backHref="/campaigns">
        {matrix.length > 0 && (
          <Link href={`/campaigns/${id}/queue`} className={styles.queueLink}>
            <Send size={16} strokeWidth={1.5} />
            Ready to post
          </Link>
        )}
      </PageHeader>
      <div className={styles.detailStack}>
        <CampaignWorkspace campaign={campaign} beats={beats} />
        <CampaignMatrix rows={matrix} />
        <PublishedPosts items={published} campaignId={id} />
      </div>
    </>
  );
}
