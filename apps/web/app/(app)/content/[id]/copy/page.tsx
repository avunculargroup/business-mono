import { notFound } from 'next/navigation';
import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { SocialDraftCopyView } from '@/components/content/SocialDraftCopyView';

// Landing page for the "Copy text" link in the social-draft email. Pure
// copy-to-clipboard surface — the email itself can't run the JS a copy button
// needs, so this real page does it instead.

export default async function ContentCopyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repositories = await getRepositories();

  const draft = await repositories.content.getSocialDraftCopy(resolveReadContext(), id);
  if (!draft) notFound();

  return (
    <>
      <PageHeader
        title={draft.title || 'Copy draft'}
        backHref={`/content/${id}`}
        backLabel="Back to draft"
      />
      <SocialDraftCopyView
        platform={draft.platform}
        accountName={draft.accountName}
        body={draft.body}
        isThread={draft.isThread}
        segments={draft.segments}
        disclaimerText={draft.disclaimerText}
      />
    </>
  );
}
