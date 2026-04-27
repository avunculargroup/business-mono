import { PageHeader } from '@/components/app-shell/PageHeader';
import { PageSkeleton } from '@/components/ui/PageSkeleton';

export default function FilesLoading() {
  return (
    <>
      <PageHeader title="Files" />
      <PageSkeleton />
    </>
  );
}
