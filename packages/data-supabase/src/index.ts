/**
 * The live adapter. Domain implementations land one vertical at a time, each
 * composed over a `SupabaseAdapterContext`.
 */
export {
  createAdapterContext,
  resolveReadContext,
  type PlatformSupabaseClient,
  type SupabaseAdapterContext,
} from './adapterContext';
export { createSupabaseRepositories } from './bundle';
export {
  createAgentActivityRepository,
  toAgentActivityItem,
} from './repositories/agentActivity';
