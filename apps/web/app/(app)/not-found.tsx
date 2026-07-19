'use client';

// Styled 404 for any `notFound()` thrown inside the app shell (a detail page
// whose row doesn't exist, a stale link). Without this, Next.js shows its bare
// default not-found screen. The app navigation stays put; only the page body is
// replaced.

import { useRouter } from 'next/navigation';
import { FileQuestion } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

export default function AppNotFound() {
  const router = useRouter();

  return (
    <EmptyState
      icon={FileQuestion}
      title="We couldn't find that"
      description="The page or record you're after doesn't exist, or may have been removed."
      actionLabel="Back to dashboard"
      onAction={() => router.push('/')}
    />
  );
}
