import { notFound } from 'next/navigation';
import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ContentEditor } from '@/components/content/ContentEditor';
import { ImageSlot } from '@/components/content/ImageSlot';
import { createClient } from '@/lib/supabase/server';
import { hasImageSlot, loadImageSlotData } from '@/lib/content/imageSlot';

export default async function ContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repositories = await getRepositories();

  // One read. The page used to run four, three of them conditional on what the
  // first returned — a thread has segments, a social draft has feedback, a
  // LinkedIn post has a character limit.
  const item = await repositories.content.getDetail(resolveReadContext(), id);
  if (!item) notFound();

  // The image slot needs a signed URL and the visual canon: storage and a
  // singleton the content read model does not carry.
  const slot = hasImageSlot(item.type) ? await loadImageSlotData(await createClient(), item.image, item.imageCandidates) : null;

  return (
    <>
      <PageHeader title={item.title || 'Untitled'} backHref="/content" />
      <ContentEditor
        item={item}
        threadSegments={item.threadSegments}
        priorFeedback={item.priorFeedback}
        maxChars={item.maxChars}
        imageSlot={
          slot && (
            <ImageSlot
              contentItemId={item.id}
              image={slot.image}
              candidates={slot.candidates}
              request={item.latestImageRequest}
              canon={slot.canon}
            />
          )
        }
      />
    </>
  );
}
