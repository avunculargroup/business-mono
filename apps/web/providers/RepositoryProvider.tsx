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
  //
  // The principal is rebuilt from those fields rather than passed through, so
  // every field it carries has to be named here. `accountId` is null for the
  // team variant, which is the only one `apps/web` ever sees — a client session
  // cannot reach this app at all, because a person is staff or a subscriber and
  // never both.
  const { userId } = principal;
  const accountId = principal.kind === 'client' ? principal.accountId : null;
  const bundle = useMemo(
    () =>
      createSupabaseRepositories(
        createClient(),
        accountId === null ? { kind: 'team', userId } : { kind: 'client', userId, accountId },
      ),
    [userId, accountId],
  );

  return <BaseRepositoryProvider bundle={bundle}>{children}</BaseRepositoryProvider>;
}
