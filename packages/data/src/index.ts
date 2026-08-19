export {
  READ_CONTEXT_KEYS,
  READ_CONTEXT_KEYS_ARE_EXHAUSTIVE,
  type Paginated,
  type QueryOptions,
  type ReadContext,
} from './context';
export { DemoWriteBlockedError, NotFoundError } from './errors';
export type { Principal, RepositoryBundle, RepositoryMode } from './bundle';
export type {
  ActivityStatus,
  AgentActivityFilter,
  AgentActivityItem,
  AgentActivityRepository,
  ProposedAction,
} from './repositories/agentActivity';

// The React provider is deliberately NOT re-exported here. It is a .tsx module,
// and adapters like @platform/data-supabase have no React and no `jsx` setting —
// re-exporting it from the root made their `tsc --noEmit` fail on JSX they never
// asked for. Import it from '@platform/data/provider'.
