import type { Database } from '@platform/db';
import type {
  ActivityStatus,
  AgentActivityFilter,
  AgentActivityItem,
  AgentActivityRepository,
  Paginated,
  ProposedAction,
  QueryOptions,
  ReadContext,
} from '@platform/data';
import type { SupabaseAdapterContext } from '../adapterContext';

type ActivityRow = Database['public']['Tables']['agent_activity']['Row'];

/** Matches the page size `/activity` has always used. */
const DEFAULT_LIMIT = 25;

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * `proposed_actions` is heterogeneous JSONB — see the note on `ProposedAction`.
 * Anything that is not an array of objects reads as no proposed actions rather
 * than throwing: this column has six writers and no schema, so a malformed blob
 * must not take out the whole feed.
 */
function toProposedActions(value: ActivityRow['proposed_actions']): ProposedAction[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    return [
      {
        description: readString(record['description']),
        entityType: readString(record['entity_type']),
        entityId: readString(record['entity_id']),
      },
    ];
  });
}

/** The first response recorded against an approval, or null. */
function toApprovedResponse(value: ActivityRow['approved_actions']): string | null {
  if (!Array.isArray(value)) return null;

  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
    const response = readString((entry as Record<string, unknown>)['response']);
    if (response) return response;
  }
  return null;
}

export function toAgentActivityItem(row: ActivityRow): AgentActivityItem {
  return {
    id: row.id,
    agentName: row.agent_name,
    action: row.action,
    // The column is `text` with a CHECK constraint the generated types do not
    // reflect, so the database — not this cast — is what makes this sound.
    status: row.status as ActivityStatus,
    triggerType: row.trigger_type,
    createdAt: row.created_at,
    entityType: row.entity_type,
    entityId: row.entity_id,
    proposedActions: toProposedActions(row.proposed_actions),
    approvedResponse: toApprovedResponse(row.approved_actions),
    workflowRunId: row.workflow_run_id,
  };
}

export function createAgentActivityRepository(
  adapter: SupabaseAdapterContext,
): AgentActivityRepository {
  const { client } = adapter;

  return {
    async listActivity(
      _ctx: ReadContext,
      filter?: AgentActivityFilter,
      opts?: QueryOptions,
    ): Promise<Paginated<AgentActivityItem>> {
      const limit = opts?.limit ?? DEFAULT_LIMIT;
      const offset = opts?.offset ?? 0;

      let query = client
        .from('agent_activity')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (filter?.status?.length) {
        query = query.in('status', filter.status);
      }
      if (filter?.agentName?.length) {
        query = query.in('agent_name', filter.agentName);
      }

      const { data, count, error } = await query.range(offset, offset + limit - 1);
      if (error) throw error;

      const items = (data ?? []).map(toAgentActivityItem);
      const total = count ?? items.length;

      return { items, total, hasMore: offset + items.length < total };
    },

    async countPending(_ctx: ReadContext): Promise<number> {
      const { count, error } = await client
        .from('agent_activity')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (error) throw error;
      return count ?? 0;
    },

    async approveActivity(
      id: string,
      decision: 'approved' | 'rejected',
      response?: string,
    ): Promise<void> {
      const { error } = await client
        .from('agent_activity')
        .update({
          status: decision,
          notes: response || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    },
  };
}
