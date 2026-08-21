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
 * There is no schema on that column and eight producers write to it, so this
 * type describes the *conventions* they share rather than any one shape.
 * Enumerating the shapes would put six producers' internals in a read model and
 * break every time one changed; the two conventions below have held across all
 * of them:
 *
 * - a discriminator, written as `type` by most and `kind` by Lex's
 *   suggested-rewrite entries;
 * - a human-readable name, written as `title` (recorder tasks), `name`
 *   (recorder CRM entities), or `description` (nothing today, but it is the
 *   obvious field for a producer to add and costs nothing to accept).
 *
 * Everything else in the blob is producer-internal — `platform`, `confidence`,
 * `needs_disclaimer`, `story_id` — and is dropped, because nothing renders it.
 *
 * (`repository-contract.md` specifies `{ id, summary, targetTable, severity }`
 * for this type. No producer writes that shape — see build-progress.md.)
 */
export interface ProposedAction {
  /** `type`, else `kind`. Null when the entry carries neither. */
  type: string | null;
  /** `description`, else `title`, else `name`. Null when the entry carries none. */
  label: string | null;
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
