import { PageSkeleton } from '@/components/ui/PageSkeleton';

export default function Loading() {
  return <PageSkeleton hasToolbar={false} rows={5} />;
}
