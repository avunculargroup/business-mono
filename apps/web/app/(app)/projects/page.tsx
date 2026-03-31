import { Suspense } from 'react';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ProjectsContent } from './ProjectsContent';
import { SkeletonLoader } from '@/components/ui/SkeletonLoader';

export default function ProjectsPage() {
  return (
    <>
      <PageHeader title="Projects" />
      <Suspense fallback={<SkeletonLoader lines={6} height="100px" />}>
        <ProjectsContent />
      </Suspense>
    </>
  );
}
