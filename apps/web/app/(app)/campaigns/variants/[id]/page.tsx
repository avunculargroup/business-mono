import { notFound } from 'next/navigation';
import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { VariantEditor, type GateState } from '@/components/campaigns/VariantEditor';

// Variant review (Gate 3). Deep-linked per variant — the campaign matrix
// (Step 8) links here, and the suspended variant carries its gate_state so the
// editor can render the platform-mimic preview, char counter, and Lex chip.

export default async function VariantReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repositories = await getRepositories();

  const variant = await repositories.campaigns.getVariantReview(resolveReadContext(), id);
  if (!variant) notFound();

  // Back to the parent campaign when this variant belongs to one; otherwise up
  // to the campaigns list. The repository resolves the slug.
  const backHref = variant.campaignSlug ? `/campaigns/${variant.campaignSlug}` : '/campaigns';
  const backLabel = variant.campaignSlug ? 'Back to campaign' : 'Back to campaigns';

  return (
    <>
      <PageHeader title="Variant review" backHref={backHref} backLabel={backLabel} />
      <VariantEditor
        contentItemId={variant.id}
        status={variant.status}
        gateState={(variant.gateState as GateState | null) ?? null}
      />
    </>
  );
}
