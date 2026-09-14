import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/db';
import { DisclosureRequiredError } from '@platform/data';
import type { Principal } from '@platform/data';

/**
 * The cookie-authed client.
 *
 * Distinct from `PlatformSupabaseClient` in name only now that both are typed
 * against the generated schema — the separation is kept because what makes this
 * client the client one is the principal it closes over below, not its row
 * types.
 */
export type ClientSupabaseClient = SupabaseClient<Database>;

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
   * Whether this session has acknowledged the current Service Statement.
   *
   * Memoised per bundle, and a bundle is per request, so the gate costs one
   * query however many surfaces the page touches. Without the memo a single
   * dashboard render would ask the same question a dozen times.
   */
  disclosureCurrent(): Promise<boolean>;
}

/**
 * Thrown by every read when the session has not acknowledged the current
 * Service Statement.
 *
 * A distinct error type rather than an empty result, because empty is
 * indistinguishable from a quiet day and the two mean opposite things. The
 * middleware should already have redirected; this is what makes the gate hold
 * if it did not.
 */
/**
 * Re-exported, not defined here.
 *
 * It moved to `@platform/data` when the fixture adapter gained the client
 * domains: two adapters throwing two classes for one contract condition would
 * make an `instanceof` check right against one and silently wrong against the
 * other. The re-export keeps every existing import working.
 */
export { DisclosureRequiredError };

export function createClientAdapterContext(
  client: ClientSupabaseClient,
  principal: Extract<Principal, { kind: 'client' }>,
): ClientAdapterContext {
  let pending: Promise<boolean> | null = null;

  const resolve = async (): Promise<boolean> => {
    // The Service Statement is the document the gate is about. None active
    // means nobody can pass, which is the correct behaviour while one has not
    // been written — see docs/features/client-app/build-progress.md on A4.
    const { data: statement } = await client
      .from('compliance_documents')
      .select('version')
      .eq('doc_type', 'service_statement')
      .eq('status', 'active')
      .maybeSingle();

    if (!statement?.version) return false;

    const { data: ack } = await client
      .from('client_disclosures')
      .select('id')
      .eq('client_user_id', principal.userId)
      .eq('document_version', statement.version)
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
