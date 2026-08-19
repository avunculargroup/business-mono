'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { RepositoryBundle } from './bundle';

const RepositoryContext = createContext<RepositoryBundle | null>(null);

/**
 * Makes a bundle available to client components via `useRepositories()`.
 *
 * Note what this provider does *not* do: it does not construct the bundle. A
 * bundle is an object of methods, and functions are not serialisable across
 * the React Server Component boundary, so a server layout cannot build one and
 * pass it down — `repository-contract.md` says "both apps mount the same
 * provider with a different bundle" without naming that constraint.
 *
 * The working shape is therefore two layers: each app owns a thin `'use client'`
 * wrapper that receives *serialisable* construction inputs from its server
 * layout (a `Principal`, an anchor date), builds its bundle inside the client
 * boundary, and mounts this provider with it. Server components and server
 * actions never go through here at all — they call their adapter factory
 * directly, per request.
 */
export function RepositoryProvider({
  bundle,
  children,
}: {
  bundle: RepositoryBundle;
  children: ReactNode;
}) {
  return <RepositoryContext.Provider value={bundle}>{children}</RepositoryContext.Provider>;
}

export function useRepositories(): RepositoryBundle {
  const bundle = useContext(RepositoryContext);
  if (!bundle) {
    throw new Error('useRepositories must be used within a RepositoryProvider');
  }
  return bundle;
}
