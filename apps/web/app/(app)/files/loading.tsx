import { PageHeader } from '@/components/app-shell/PageHeader';
import { PageSkeleton } from '@platform/ui/PageSkeleton';

export default function FilesLoading() {
  return (
    <>
      <PageHeader title="Files" />
      <PageSkeleton variant="cards" hasToolbar={false} />
    </>
  );
}
