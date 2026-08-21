import { notFound } from 'next/navigation';
import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ContentEditor } from '@/components/content/ContentEditor';

export default async function ContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repositories = await getRepositories();

  // One read. The page used to run four, three of them conditional on what the
  // first returned — a thread has segments, a social draft has feedback, a
  // LinkedIn post has a character limit.
  const item = await repositories.content.getDetail(resolveReadContext(), id);
  if (!item) notFound();

  return (
    <>
      <PageHeader title={item.title || 'Untitled'} backHref="/content" />
      <ContentEditor
        item={item}
        threadSegments={item.threadSegments}
        priorFeedback={item.priorFeedback}
        maxChars={item.maxChars}
      />
    </>
  );
}
