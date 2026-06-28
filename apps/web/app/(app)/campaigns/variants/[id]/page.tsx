import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { VariantEditor } from '@/components/campaigns/VariantEditor';

// Variant review (Gate 3). Deep-linked per variant — the campaign matrix
// (Step 8) links here, and the suspended variant carries its gate_state so the
// editor can render the platform-mimic preview, char counter, and Lex chip.

export default async function VariantReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // content_items gate columns aren't in the web Database types until
  // db:generate-types runs post-migration — cast at the boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('content_items')
    .select('id, status, workflow_run_id, gate_state, campaign_id')
    .eq('id', id)
    .maybeSingle();

  if (!data) notFound();

  // Link back to the parent campaign when this variant belongs to one; otherwise
  // up to the campaigns list.
  const backHref = data.campaign_id ? `/campaigns/${data.campaign_id}` : '/campaigns';
  const backLabel = data.campaign_id ? 'Back to campaign' : 'Back to campaigns';

  return (
    <>
      <PageHeader title="Variant review" backHref={backHref} backLabel={backLabel} />
      <VariantEditor contentItemId={data.id} status={data.status} gateState={data.gate_state ?? null} />
    </>
  );
}
