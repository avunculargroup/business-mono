import { PageSkeleton } from '@platform/ui/PageSkeleton';

export default function Loading() {
  return <PageSkeleton hasToolbar={false} rows={8} />;
}
