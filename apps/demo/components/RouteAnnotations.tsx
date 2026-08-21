'use client';

import { usePathname } from 'next/navigation';
import { annotationsFor } from '@/lib/routeMatch';
import { AnnotationOverlay } from './AnnotationOverlay';

export function RouteAnnotations() {
  const pathname = usePathname();

  return <AnnotationOverlay annotations={annotationsFor(pathname)} />;
}
