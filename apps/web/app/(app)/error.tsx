'use client';

// Humane boundary for any error thrown while rendering a page inside the app
// shell (a failed server-component data fetch, an unexpected throw in a server
// action transition). Without this, Next.js shows its bare default error
// screen. The app navigation stays put; only the page body is replaced.

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { humanizeError } from '@/lib/errors';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the full detail in the logs for diagnosis.
    console.error('[app-error-boundary]', error);
  }, [error]);

  return (
    <EmptyState
      icon={AlertTriangle}
      title="This page hit a snag"
      description={humanizeError(error, "We couldn't load this page just now. Try again, and if it keeps happening let us know.")}
      actionLabel="Try again"
      onAction={reset}
    />
  );
}
