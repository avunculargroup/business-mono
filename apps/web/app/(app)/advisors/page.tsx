import { Suspense } from 'react';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { AdvisorsContent } from './AdvisorsContent';
import { SkeletonLoader } from '@/components/ui/SkeletonLoader';

export default function AdvisorsPage() {
  return (
    <>
      <PageHeader title="Advisors & partners" />
      <Suspense fallback={<SkeletonLoader lines={6} height="100px" />}>
        <AdvisorsContent />
      </Suspense>
    </>
  );
}
