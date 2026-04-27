import { PageHeader } from '@/components/app-shell/PageHeader';
import { FilesView } from './FilesView';
import { getFiles } from '@/app/actions/files';

export default async function FilesPage() {
  const { files } = await getFiles();

  return (
    <>
      <PageHeader title="Files" />
      <FilesView initialFiles={files} />
    </>
  );
}
