import { PageHeader } from '@/components/app-shell/PageHeader';
import { TemplatesList } from '@/components/discovery/TemplatesList';
import { getTemplates } from '@/app/actions/templates';

export default async function TemplatesPage() {
  const templates = await getTemplates();

  return (
    <>
      <PageHeader title="MVP Templates" />
      <TemplatesList initialTemplates={templates} />
    </>
  );
}
