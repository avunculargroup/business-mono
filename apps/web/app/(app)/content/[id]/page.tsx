import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ContentEditor } from '@/components/content/ContentEditor';
import type { DraftFeedbackEntry } from '@/components/content/DraftFeedback';
import { idColumn } from '@/lib/utils';

export default async function ContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // social_account_id and content_feedback are not in the generated Database
  // types yet — cast to bypass typing (same pattern as the campaign pages).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: item } = await db
    .from('content_items')
    .select('*')
    .eq(idColumn(id), id)
    .single();

  if (!item) notFound();

  const { data: threadSegments } = item.is_thread
    ? await db
        .from('thread_segments')
        .select('id, body')
        .eq('content_item_id', item.id)
        .order('sequence', { ascending: true })
    : { data: null };

  // Prior feedback on this draft (social drafts only — the box needs an account).
  const { data: priorFeedback } = item.social_account_id
    ? await db
        .from('content_feedback')
        .select('id, verdict, feedback, created_at')
        .eq('content_item_id', item.id)
        .order('created_at', { ascending: false })
    : { data: null };

  return (
    <>
      <PageHeader title={item.title || 'Untitled'} backHref="/content" />
      <ContentEditor
        item={item}
        threadSegments={threadSegments ?? []}
        priorFeedback={(priorFeedback ?? []) as DraftFeedbackEntry[]}
      />
    </>
  );
}
