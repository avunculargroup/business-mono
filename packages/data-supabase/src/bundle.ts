import type { Principal, RepositoryBundle } from '@platform/data';
import { createAdapterContext, type PlatformSupabaseClient } from './adapterContext';
import { createAgentActivityRepository } from './repositories/agentActivity';
import { createContentRepository } from './repositories/content';
import { createResearchRepository } from './repositories/research';

/**
 * Builds a bundle scoped to `principal`.
 *
 * The principal is bound here and nowhere else. No repository method takes a
 * scoping argument, so a caller holding this bundle has no way to ask for data
 * outside it — which is what lets a differently-scoped consumer be a different
 * construction rather than a signature change across every repository.
 *
 * Domains are added as their verticals land.
 */
export function createSupabaseRepositories(
  client: PlatformSupabaseClient,
  principal: Principal,
): RepositoryBundle {
  const adapter = createAdapterContext(client, principal);

  return {
    agentActivity: createAgentActivityRepository(adapter),
    research: createResearchRepository(adapter),
    content: createContentRepository(adapter),
    mode: 'live',
  };
}
