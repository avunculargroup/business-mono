import { notFound } from 'next/navigation';
import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { SocialDraftCopyView } from '@/components/content/SocialDraftCopyView';
import { createClient } from '@/lib/supabase/server';

// Landing page for the "Copy text" link in the social-draft email. Pure
// copy-to-clipboard surface — the email itself can't run the JS a copy button
// needs, so this real page does it instead.

export default async function ContentCopyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repositories = await getRepositories();

  const draft = await repositories.content.getSocialDraftCopy(resolveReadContext(), id);
  if (!draft) notFound();

  // A preview of the crop that will be downloaded; the download itself is
  // signed on click, so it carries the file name.
  let image = null;
  if (draft.image) {
    const supabase = await createClient();
    const { data } = await supabase.storage.from('platform-files').createSignedUrl(draft.image.storagePath, 3600);
    image = { ...draft.image, previewUrl: data?.signedUrl ?? null };
  }

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
        image={image}
      />
    </>
  );
}
