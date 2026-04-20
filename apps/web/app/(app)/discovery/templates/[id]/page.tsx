import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { TemplateVersionEditor } from '@/components/discovery/TemplateVersionEditor';
import { getTemplate } from '@/app/actions/templates';

export default async function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let template;
  try {
    template = await getTemplate(id);
  } catch {
    notFound();
  }

  return (
    <>
      <PageHeader title={template.title} />
      <TemplateVersionEditor template={template} />
    </>
  );
}
