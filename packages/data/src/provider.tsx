'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Bundle, RepositoryDomain } from './bundle';

/**
 * The context holds the narrowest bundle shape — mode and nothing else — and
 * each read widens it to the slice the caller asked for.
 *
 * That widening is a cast, and React context cannot avoid one: a single context
 * has a single type, while the whole point of the splittable bundle is that
 * different apps mount different slices. What makes it safe in practice is that
 * the cast is here, in one place, and every caller names the domains it needs.
 */
const RepositoryContext = createContext<Bundle<never> | null>(null);

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
export function RepositoryProvider<K extends RepositoryDomain>({
  bundle,
  children,
}: {
  bundle: Bundle<K>;
  children: ReactNode;
}) {
  return <RepositoryContext.Provider value={bundle}>{children}</RepositoryContext.Provider>;
}

/**
 * The domains this component needs, named at the call site:
 * `useRepositories<'research'>()`.
 *
 * There is deliberately no default. A component that names its slice is a
 * component whose data dependencies are visible in its own source, and one
 * shared between `apps/web` and `apps/demo` states the domains both bundles
 * must therefore carry. A default of "everything" would let a component reach
 * for a domain the demo's bundle does not have and only fail at runtime.
 */
export function useRepositories<K extends RepositoryDomain>(): Bundle<K> {
  const bundle = useContext(RepositoryContext);
  if (!bundle) {
    throw new Error('useRepositories must be used within a RepositoryProvider');
  }
  return bundle as Bundle<K>;
}
