import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ContentEditor } from '@/components/content/ContentEditor';

export default async function ContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from('content_items')
    .select('*')
    .eq('id', id)
    .single();

  if (!item) notFound();

  return (
    <>
      <PageHeader title={item.title || 'Untitled'} />
      <ContentEditor item={item} />
    </>
  );
}
