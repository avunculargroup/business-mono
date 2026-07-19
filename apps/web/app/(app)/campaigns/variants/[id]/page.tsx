import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { VariantEditor, type GateState } from '@/components/campaigns/VariantEditor';
import { idColumn } from '@/lib/utils';

// Variant review (Gate 3). Deep-linked per variant — the campaign matrix
// (Step 8) links here, and the suspended variant carries its gate_state so the
// editor can render the platform-mimic preview, char counter, and Lex chip.

export default async function VariantReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from('content_items')
    .select('id, status, workflow_run_id, gate_state, campaign_id')
    .eq(idColumn(id), id)
    .maybeSingle();

  if (!data) notFound();

  // Link back to the parent campaign (by slug) when this variant belongs to one;
  // otherwise up to the campaigns list.
  let campaignSlug: string | null = null;
  if (data.campaign_id) {
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('slug')
      .eq('id', data.campaign_id)
      .single();
    campaignSlug = campaign?.slug ?? null;
  }
  const backHref = campaignSlug ? `/campaigns/${campaignSlug}` : '/campaigns';
  const backLabel = campaignSlug ? 'Back to campaign' : 'Back to campaigns';

  return (
    <>
      <PageHeader title="Variant review" backHref={backHref} backLabel={backLabel} />
      <VariantEditor
        contentItemId={data.id}
        status={data.status}
        gateState={(data.gate_state as GateState | null) ?? null}
      />
    </>
  );
}
