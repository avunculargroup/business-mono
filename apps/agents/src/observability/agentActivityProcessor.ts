import type { AnySpan, SpanOutputProcessor } from '@mastra/core/observability';
import { SpanType } from '@mastra/core/observability';
import { supabase } from '@platform/db';
import { AgentActivityStatus } from '@platform/shared';

// Span types we mirror into agent_activity. Model/memory/RAG spans are
// excluded — they would dominate the table without adding audit value.
const MIRRORED_SPAN_TYPES: ReadonlySet<SpanType> = new Set([
  SpanType.AGENT_RUN,
  SpanType.WORKFLOW_RUN,
  SpanType.WORKFLOW_STEP,
  SpanType.TOOL_CALL,
]);

// Valid agent names that match the database constraint
const VALID_AGENT_NAMES = new Set(['simon', 'roger', 'archie', 'petra', 'bruno', 'charlie', 'rex', 'della']);

// Span rows are mirrored under trigger_type='agent'. The originating span type
// (agent_run/workflow_run/tool_call/...) lives in notes.spanType, so the
// dispatch-vs-span distinction is preserved without growing the constraint.
const TRIGGER_TYPE = 'agent';

// Escalate after this many consecutive insert failures so a broken audit trail
// is visible as a single loud line, not buried in a stream of per-row errors.
const FAILURE_ESCALATION_THRESHOLD = 25;

type SpanNotes = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  spanType: string;
  durationMs?: number;
  errorMessage?: string;
  errorStack?: string;
};

/**
 * Mastra `SpanOutputProcessor` that mirrors agent/tool/workflow spans into the
 * existing `agent_activity` audit table. The processor is side-effecting only —
 * it never mutates the span and always passes it through to subsequent
 * processors. Failures are logged and swallowed so a DB hiccup never breaks
 * tracing.
 *
 * `process()` is invoked for SPAN_STARTED, SPAN_UPDATED, and SPAN_ENDED events
 * on the same Span instance. We write one `in_progress` row on first sighting
 * and one `auto`/`error` row when the span ends.
 */
export class AgentActivitySpanProcessor implements SpanOutputProcessor {
  name = 'agent-activity-processor';

  // Tracks spans we've already written an in_progress row for, keyed by span.id.
  private readonly seenSpanIds = new Set<string>();

  // Consecutive insert failures since the last success. Used to escalate when
  // tracing has been silently broken for a sustained run of spans.
  private consecutiveFailures = 0;

  process(span?: AnySpan): AnySpan | undefined {
    if (!span) return span;
    if (!MIRRORED_SPAN_TYPES.has(span.type)) return span;

    const spanId = span.id;
    if (!span.endTime) {
      // SPAN_STARTED or SPAN_UPDATED — write in_progress only on first sighting.
      if (!this.seenSpanIds.has(spanId)) {
        this.seenSpanIds.add(spanId);
        void this.writeRow(span, AgentActivityStatus.IN_PROGRESS);
      }
    } else {
      // SPAN_ENDED.
      const status = span.errorInfo
        ? AgentActivityStatus.ERROR
        : AgentActivityStatus.AUTO;
      void this.writeRow(span, status);
      this.seenSpanIds.delete(spanId);
    }

    return span;
  }

  async shutdown(): Promise<void> {
    this.seenSpanIds.clear();
  }

  private async writeRow(span: AnySpan, status: AgentActivityStatus): Promise<void> {
    try {
      const agentName = agentNameFromSpan(span);

      // Skip logging if agent_name is not valid (e.g., workflow step spans without a valid agent context)
      if (!VALID_AGENT_NAMES.has(agentName)) {
        return;
      }

      const notes: SpanNotes = {
        traceId: span.traceId,
        spanId: span.id,
        parentSpanId: span.getParentSpanId(),
        spanType: span.type,
      };
      if (span.endTime) {
        notes.durationMs = span.endTime.getTime() - span.startTime.getTime();
      }
      if (span.errorInfo) {
        notes.errorMessage = span.errorInfo.message;
        if (span.errorInfo.stack) notes.errorStack = span.errorInfo.stack;
      }

      const action = actionFromSpan(span, status);
      const { error } = await supabase.from('agent_activity').insert({
        agent_name: agentName,
        action,
        status,
        trigger_type: TRIGGER_TYPE,
        workflow_run_id: span.type === SpanType.WORKFLOW_RUN ? span.id : null,
        entity_type: span.entityType ?? null,
        entity_id: span.entityId ?? null,
        proposed_actions: null,
        approved_actions: null,
        clarifications: null,
        notes: JSON.stringify(notes),
      });
      if (error) {
        this.recordFailure({ agentName, action, status, spanType: span.type, error });
      } else {
        this.recordSuccess();
      }
    } catch (err) {
      this.recordFailure({
        agentName: agentNameFromSpan(span),
        action: actionFromSpan(span, status),
        status,
        spanType: span.type,
        error: err,
      });
    }
  }

  private recordSuccess(): void {
    if (this.consecutiveFailures > 0) {
      console.warn(
        `[agent-activity-processor] recovered after ${this.consecutiveFailures} failed insert(s) — audit trail resumed`,
      );
      this.consecutiveFailures = 0;
    }
  }

  private recordFailure(ctx: {
    agentName: string;
    action: string;
    status: AgentActivityStatus;
    spanType: string;
    error: unknown;
  }): void {
    this.consecutiveFailures += 1;
    console.error('[agent-activity-processor] insert failed', {
      agent: ctx.agentName,
      action: ctx.action,
      status: ctx.status,
      spanType: ctx.spanType,
      consecutiveFailures: this.consecutiveFailures,
      error: serialiseError(ctx.error),
    });
    if (this.consecutiveFailures % FAILURE_ESCALATION_THRESHOLD === 0) {
      console.error(
        `[agent-activity-processor] CRITICAL: ${this.consecutiveFailures} consecutive audit-trail inserts have failed. ` +
          `agent_activity is no longer recording spans — check DB connectivity or the agent_activity CHECK constraints.`,
      );
    }
  }
}

function serialiseError(err: unknown): Record<string, unknown> {
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    return {
      message: e.message,
      code: e.code,
      details: e.details,
      hint: e.hint,
    };
  }
  return { message: String(err) };
}

function agentNameFromSpan(span: AnySpan): string {
  if (span.entityName) return span.entityName;
  // Walk up to the closest AGENT_RUN or WORKFLOW_RUN ancestor for a
  // meaningful agent_name on tool/step rows that have no entityName.
  const agentAncestor = span.findParent(SpanType.AGENT_RUN);
  if (agentAncestor?.entityName) return agentAncestor.entityName;
  const workflowAncestor = span.findParent(SpanType.WORKFLOW_RUN);
  if (workflowAncestor?.entityName) return workflowAncestor.entityName;
  return span.name || 'unknown';
}

function actionFromSpan(span: AnySpan, status: AgentActivityStatus): string {
  const verb =
    status === AgentActivityStatus.IN_PROGRESS
      ? 'Started'
      : status === AgentActivityStatus.ERROR
      ? 'Failed'
      : 'Completed';
  return `${verb} ${span.type}: ${span.name}`;
}
