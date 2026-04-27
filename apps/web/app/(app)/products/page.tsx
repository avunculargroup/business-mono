import { Suspense } from 'react';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ProductsContent } from './ProductsContent';
import { SkeletonLoader } from '@/components/ui/SkeletonLoader';

export default function ProductsPage() {
  return (
    <>
      <PageHeader title="Products & services" />
      <Suspense fallback={<SkeletonLoader lines={6} height="100px" />}>
        <ProductsContent />
      </Suspense>
    </>
  );
}
