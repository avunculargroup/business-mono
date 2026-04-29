import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { DocVersionEditor } from '@/components/docs/DocVersionEditor';
import { getDocument } from '@/app/actions/documents';

export default async function DocDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let document;
  try {
    document = await getDocument(id);
  } catch {
    notFound();
  }

  return (
    <>
      <PageHeader title={document.title} />
      <DocVersionEditor document={document} />
    </>
  );
}
