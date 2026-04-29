import { PageHeader } from '@/components/app-shell/PageHeader';
import { DocsList } from '@/components/docs/DocsList';
import { getDocuments } from '@/app/actions/documents';

export default async function DocsPage() {
  const documents = await getDocuments();

  return (
    <>
      <PageHeader title="Docs" />
      <DocsList initialDocuments={documents} />
    </>
  );
}
