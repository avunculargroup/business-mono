import type { ClientDataContext, Principal } from '@platform/data';
import { createClientAdapterContext, type ClientSupabaseClient } from './context';
import {
  createClientAccountRepository,
  createClientBriefRepository,
  createClientComplianceRepository,
  createClientDirectoryRepository,
  createClientIndicatorRepository,
  createClientLibraryRepository,
  createClientPrepareRepository,
  createClientRegisterRepository,
  createClientSessionRepository,
  createClientSignalRepository,
} from './repositories';
import { createClientWriteRepository } from './writes';

/**
 * Builds the client context for one subscriber, for one request.
 *
 * Per request rather than per session, because the disclosure check is memoised
 * on the adapter context — a long-lived bundle would keep answering "yes" after
 * a new Service Statement version went active, and the gate would stop
 * re-triggering.
 *
 * The principal is bound here and nowhere else. No method on any repository
 * takes an `accountId`, so a caller holding this object cannot ask about
 * another subscriber's account even by accident.
 */
export function createClientRepositories(
  client: ClientSupabaseClient,
  principal: Extract<Principal, { kind: 'client' }>,
): ClientDataContext {
  const adapter = createClientAdapterContext(client, principal);

  return {
    session: createClientSessionRepository(adapter),
    brief: createClientBriefRepository(adapter),
    signals: createClientSignalRepository(adapter),
    indicators: createClientIndicatorRepository(adapter),
    register: createClientRegisterRepository(adapter),
    directory: createClientDirectoryRepository(adapter),
    library: createClientLibraryRepository(adapter),
    prepare: createClientPrepareRepository(adapter),
    compliance: createClientComplianceRepository(adapter),
    account: createClientAccountRepository(adapter),
    writes: createClientWriteRepository(adapter),
  };
}
