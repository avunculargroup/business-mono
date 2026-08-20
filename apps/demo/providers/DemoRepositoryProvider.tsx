'use client';

import { useMemo, type ReactNode } from 'react';
import { RepositoryProvider } from '@platform/data/provider';
import { createFixtureRepositories } from '@platform/data-fixtures';

/**
 * The demo's half of the two-layer provider shape.
 *
 * A bundle is an object of methods, and functions do not cross the React
 * Server Component boundary, so a server layout cannot build one and pass it
 * down. Each app therefore owns a thin client wrapper that builds its bundle
 * inside the client boundary — `apps/web` takes a `Principal` from its server
 * layout and constructs the Supabase bundle; this one takes nothing at all,
 * because there is nothing to connect to and nothing to scope.
 *
 * Memoised on the empty dependency list rather than rebuilt per render: the
 * bundle is stateless, and a new object identity every render would invalidate
 * every consumer downstream.
 */
export function DemoRepositoryProvider({ children }: { children: ReactNode }) {
  const bundle = useMemo(() => createFixtureRepositories(), []);

  return <RepositoryProvider bundle={bundle}>{children}</RepositoryProvider>;
}
