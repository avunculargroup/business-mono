import { Suspense } from 'react';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { SkeletonLoader } from '@/components/ui/SkeletonLoader';
import { SignalsContent } from './SignalsContent';

export default function SignalsPage() {
  return (
    <>
      <PageHeader title="Signals" />
      <Suspense fallback={<SkeletonLoader lines={8} height="64px" />}>
        <SignalsContent />
      </Suspense>
    </>
  );
}
