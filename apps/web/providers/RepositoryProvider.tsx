'use client';

import { useMemo } from 'react';
import { RepositoryProvider as BaseRepositoryProvider } from '@platform/data/provider';
import { createSupabaseRepositories } from '@platform/data-supabase';
import { createClient } from '@/lib/supabase/browser';
import type { Principal } from '@platform/data';

/**
 * Builds the live bundle inside the client boundary and hands it down.
 *
 * The server layout cannot build it: a bundle is an object of methods, and
 * functions are not serialisable across the RSC boundary. So it passes the
 * `Principal` — which is plain data — and construction happens here, against
 * the browser Supabase client. Server components and server actions do not go
 * through this at all; they call `getRepositories()` / `getAuthedRepositories()`
 * per request.
 *
 * The demo app mounts the same base provider with a fixture bundle, which is
 * the whole point of the split.
 */
export function RepositoryProvider({
  principal,
  children,
}: {
  principal: Principal;
  children: React.ReactNode;
}) {
  // Keyed on the principal's fields rather than its identity: the server
  // rebuilds the prop object on every render, so depending on the object would
  // hand every consumer a new bundle each time and defeat the memo.
  const { kind, userId } = principal;
  const bundle = useMemo(
    () => createSupabaseRepositories(createClient(), { kind, userId }),
    [kind, userId],
  );

  return <BaseRepositoryProvider bundle={bundle}>{children}</BaseRepositoryProvider>;
}
