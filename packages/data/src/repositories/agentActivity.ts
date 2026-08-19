import type { Paginated, QueryOptions, ReadContext } from '../context';

/**
 * Taken from the live CHECK constraint, not from `schema.sql` — which is stale
 * and omits `in_progress`.
 */
export type ActivityStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'auto'
  | 'in_progress'
  | 'error';

/**
 * One entry of the `proposed_actions` JSONB.
 *
 * Typed permissively on purpose. Six producers write six different shapes into
 * that column — `{ type: 'variant', platform, is_thread }` from the variant
 * workflow, `{ type: 'create_task', title, due_date, assignee }` from the
 * recorder, `{ type: 'social_post', … }` from socialPost, and so on — and only
 * the recorder's CRM-update shape carries `description`. Pinning a struct here
 * would be a lie about the data. The fields below are the ones the UI reads;
 * everything else in the blob is dropped by the adapter because nothing renders
 * it.
 *
 * (`repository-contract.md` specifies `{ id, summary, targetTable, severity }`
 * for this type. No producer writes that shape — see build-progress.md.)
 */
export interface ProposedAction {
  description: string | null;
  entityType: string | null;
  entityId: string | null;
}

/**
 * The read model for an activity row.
 *
 * One model rather than the summary/detail pair in `repository-contract.md`:
 * `/activity` renders the same card in the list as a detail view would, down to
 * the proposed-action descriptions and the entity link, so a lean summary type
 * would have to be re-fetched immediately. There is no `/activity/[id]` route
 * and no `getActivity` method until something needs one.
 */
export interface AgentActivityItem {
  id: string;
  agentName: string;
  action: string;
  status: ActivityStatus;
  triggerType: string | null;
  createdAt: string;
  entityType: string | null;
  entityId: string | null;
  proposedActions: ProposedAction[];
  /**
   * The first response recorded in `approved_actions`. Flattened here rather
   * than exposing the array, because that is the only thing read from it.
   */
  approvedResponse: string | null;
  workflowRunId: string | null;
}

export interface AgentActivityFilter {
  status?: ActivityStatus[];
  agentName?: string[];
}

export interface AgentActivityRepository {
  listActivity(
    ctx: ReadContext,
    filter?: AgentActivityFilter,
    opts?: QueryOptions,
  ): Promise<Paginated<AgentActivityItem>>;

  /** Drives the sidebar badge. A count, not a list — the rows are never read. */
  countPending(ctx: ReadContext): Promise<number>;

  /** Write — throws `DemoWriteBlockedError` in fixtures. */
  approveActivity(
    id: string,
    decision: 'approved' | 'rejected',
    response?: string,
  ): Promise<void>;
}
