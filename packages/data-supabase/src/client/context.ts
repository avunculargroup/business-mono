import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClientDatabase } from '@platform/db';
import type { Principal } from '@platform/data';

/**
 * The cookie-authed client, typed against the schema the client-app migrations
 * create.
 *
 * Distinct from `PlatformSupabaseClient` on purpose. `apps/web` and
 * `apps/agents` type against `Database`, which is generated from the live
 * database and therefore cannot see a table whose migration has not run — so
 * neither of them can reach a client table by accident, and `apps/client` does
 * not have to wait on a production migration to compile. See
 * `packages/db/src/types/pendingClientTables.ts`.
 */
export type ClientSupabaseClient = SupabaseClient<ClientDatabase>;

/**
 * What every client domain closes over.
 *
 * The principal is narrowed to the client variant at construction, so no domain
 * can be handed a team principal by accident and no method takes an
 * `accountId`. Same scoping rule as the internal adapter, one variant further
 * along.
 */
export interface ClientAdapterContext {
  readonly client: ClientSupabaseClient;
  readonly principal: Extract<Principal, { kind: 'client' }>;
  /**
   * Whether this session has acknowledged the current FSG.
   *
   * Memoised per bundle, and a bundle is per request, so the gate costs one
   * query however many surfaces the page touches. Without the memo a single
   * dashboard render would ask the same question a dozen times.
   */
  disclosureCurrent(): Promise<boolean>;
}

/**
 * Thrown by every read when the session has not acknowledged the current FSG.
 *
 * A distinct error type rather than an empty result, because empty is
 * indistinguishable from a quiet day and the two mean opposite things. The
 * middleware should already have redirected; this is what makes the gate hold
 * if it did not.
 */
export class DisclosureRequiredError extends Error {
  constructor() {
    super('The current disclosure has not been acknowledged');
    this.name = 'DisclosureRequiredError';
  }
}

export function createClientAdapterContext(
  client: ClientSupabaseClient,
  principal: Extract<Principal, { kind: 'client' }>,
): ClientAdapterContext {
  let pending: Promise<boolean> | null = null;

  const resolve = async (): Promise<boolean> => {
    // The active FSG is the document the gate is about. No active FSG means
    // nobody can pass, which is the correct behaviour while one has not been
    // drafted — see docs/features/client-app/build-progress.md on A4.
    const { data: fsg } = await client
      .from('compliance_documents')
      .select('version')
      .eq('doc_type', 'fsg')
      .eq('status', 'active')
      .maybeSingle();

    if (!fsg?.version) return false;

    const { data: ack } = await client
      .from('client_disclosures')
      .select('id')
      .eq('client_user_id', principal.userId)
      .eq('document_version', fsg.version)
      .maybeSingle();

    return ack !== null;
  };

  return Object.freeze({
    client,
    principal,
    disclosureCurrent() {
      pending ??= resolve();
      return pending;
    },
  });
}

/** Guard at the top of every gated read. */
export async function requireDisclosure(adapter: ClientAdapterContext): Promise<void> {
  if (!(await adapter.disclosureCurrent())) throw new DisclosureRequiredError();
}
