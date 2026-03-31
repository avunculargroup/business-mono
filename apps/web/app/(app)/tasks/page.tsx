import { Suspense } from 'react';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { TasksContent } from './TasksContent';
import { SkeletonLoader } from '@/components/ui/SkeletonLoader';

export default function TasksPage() {
  return (
    <>
      <PageHeader title="Tasks" />
      <Suspense fallback={<SkeletonLoader lines={8} height="40px" />}>
        <TasksContent />
      </Suspense>
    </>
  );
}
