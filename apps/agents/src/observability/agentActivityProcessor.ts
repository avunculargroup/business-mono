import type { AnySpan, SpanOutputProcessor } from '@mastra/core/observability';
import { SpanType } from '@mastra/core/observability';
import { supabase, type Json } from '@platform/db';
import { AgentActivityStatus } from '@platform/shared';

// Span types we mirror into agent_activity. Model/memory/RAG spans are
// excluded — they would dominate the table without adding audit value.
const MIRRORED_SPAN_TYPES: ReadonlySet<SpanType> = new Set([
  SpanType.AGENT_RUN,
  SpanType.WORKFLOW_RUN,
  SpanType.WORKFLOW_STEP,
  SpanType.TOOL_CALL,
]);

const TRIGGER_TYPE = 'mastra-span';

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

      const { error } = await supabase.from('agent_activity').insert({
        agent_name: agentNameFromSpan(span),
        action: actionFromSpan(span, status),
        status,
        trigger_type: TRIGGER_TYPE,
        workflow_run_id: span.type === SpanType.WORKFLOW_RUN ? span.id : null,
        entity_type: span.entityType ?? null,
        entity_id: span.entityId ?? null,
        proposed_actions: null,
        approved_actions: null,
        clarifications: null,
        notes: JSON.stringify(notes) as Json,
      });
      if (error) {
        console.error('[agent-activity-processor] insert failed', error);
      }
    } catch (err) {
      console.error('[agent-activity-processor] insert threw', err);
    }
  }
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
