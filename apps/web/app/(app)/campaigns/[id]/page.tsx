import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { CampaignWorkspace, type CampaignRow, type BeatRow } from '@/components/campaigns/CampaignWorkspace';

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
  // the locked canvas. Before then they live transiently in gate_state.
  let beats: BeatRow[] = [];
  if (campaign.status === 'plan_approved' || campaign.status === 'active' || campaign.status === 'completed') {
    const { data: beatData } = await db
      .from('campaign_beats')
      .select('id, sequence, title, core_message, rationale, prefer_thread')
      .eq('campaign_id', id)
      .order('sequence', { ascending: true });
    beats = (beatData ?? []) as BeatRow[];
  }

  return (
    <>
      <PageHeader title={campaign.name} />
      <CampaignWorkspace campaign={campaign} beats={beats} />
    </>
  );
}
