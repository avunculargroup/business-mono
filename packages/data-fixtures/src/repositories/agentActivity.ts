import type {
  AgentActivityFilter,
  AgentActivityItem,
  AgentActivityRepository,
  Paginated,
  QueryOptions,
  ReadContext,
} from '@platform/data';
import { blocked } from '../blocked';
import { paginate } from '../paginate';
import { agentActivity } from '../fixtures';

/**
 * Filtering happens here, not in the caller.
 *
 * The contract says filtering is pushed into the adapter — the live one turns
 * a filter into `.in()` clauses, this one into `Array.filter`. A caller that
 * fetched everything and filtered in the page would work against fixtures and
 * fall over against 40,000 rows, which is exactly the divergence the shared
 * contract suite exists to catch.
 */
function applyFilter(
  rows: readonly AgentActivityItem[],
  filter?: AgentActivityFilter,
): AgentActivityItem[] {
  return rows.filter((row) => {
    if (filter?.status?.length && !filter.status.includes(row.status)) return false;
    if (filter?.agentName?.length && !filter.agentName.includes(row.agentName)) return false;
    return true;
  });
}

export function createAgentActivityRepository(): AgentActivityRepository {
  return {
    async listActivity(
      ctx: ReadContext,
      filter?: AgentActivityFilter,
      opts?: QueryOptions,
    ): Promise<Paginated<AgentActivityItem>> {
      const rows = applyFilter(agentActivity(ctx.asOf), filter);
      return paginate(rows, opts);
    },

    async countPending(ctx: ReadContext): Promise<number> {
      return agentActivity(ctx.asOf).filter((row) => row.status === 'pending').length;
    },

    async approveActivity(): Promise<void> {
      return blocked('approveActivity', 'agent_activity');
    },
  };
}
