/**
 * The trace format, owned by BTS.
 *
 * **This file must never import from `@mastra/core`.** Mastra's APIs move
 * quickly, and a public demo that breaks on an unrelated framework upgrade is
 * the worst kind of maintenance liability: it fails silently, at the moment
 * someone is looking at it. The recorder translates Mastra's span output into
 * these types, so when Mastra changes only the recorder needs updating and the
 * demo keeps working from the already-recorded bundle regardless.
 *
 * The package has no dependencies at all, for the same reason.
 */

export const TRACE_SCHEMA_VERSION = 1 as const;

export interface TraceBundle {
  schemaVersion: typeof TRACE_SCHEMA_VERSION;
  traceId: string;
  workflowName: string;
  /**
   * When the run happened, displayed to the reader.
   *
   * The one exception to the demo's relative-dating rule: a trace carries a real
   * timestamp and is shown as "recorded on {date}". Honesty beats fabricated
   * freshness here — and see `provenance`, which exists because that honesty
   * has to survive a bundle that was not recorded at all.
   */
  recordedAt: string;
  /**
   * How this bundle came to exist.
   *
   * `recorded` means a real workflow run produced it through the recorder.
   * `authored` means a person wrote it against the workflow source. The
   * distinction is load-bearing: the whole value of a trace over a mockup is
   * that it is a real run, and a bundle that claimed to be recorded when it was
   * not would be exactly the fabricated record this project refuses to ship
   * elsewhere. The UI states which it is.
   */
  provenance: 'recorded' | 'authored';
  /** Real elapsed time, before replay compression. */
  totalDurationMs: number;
  steps: TraceStep[];
  redactions: RedactionRecord[];
}

export interface TraceStepBase {
  index: number;
  /** Milliseconds since the previous step, as recorded. */
  offsetMs: number;
  /** Milliseconds to wait in replay. Capped and floored — see `compress`. */
  replayDelayMs: number;
  /** Shown in the transport timeline. */
  label: string;
  /** Links this step to the annotation layer. */
  annotationId?: string;
}

export interface WorkflowStartStep extends TraceStepBase {
  kind: 'workflow_start';
  trigger: string;
  inputSummary: Record<string, unknown>;
}

export interface DeterministicComputeStep extends TraceStepBase {
  kind: 'deterministic_compute';
  description: string;
  /** The committed payload — what the agent will later receive, and only this. */
  payload: unknown;
  /** Rows in, rows out. Makes the filtering visible rather than asserted. */
  inputCount: number;
  outputCount: number;
}

export interface AgentInvocationStep extends TraceStepBase {
  kind: 'agent_invocation';
  agentName: string;
  /** The exact payload handed in. Must be a subset of a prior committed payload. */
  inputPayload: unknown;
  outputText: string;
  toolCallIndices?: number[];
}

export interface ToolCallStep extends TraceStepBase {
  kind: 'tool_call';
  toolName: string;
  input: unknown;
  output: unknown;
}

/** Lex's verdict, first-class rather than flattened into a tool call. */
export interface ComplianceVerdictStep extends TraceStepBase {
  kind: 'compliance_verdict';
  verdict: 'cleared' | 'flagged';
  classification: 'educational' | 'general_advice' | 'personal_opinion';
  rationale: string;
  needsDisclaimer: boolean;
  /** Present when flagged — `verdictToActivity` writes a suggested_rewrite action. */
  suggestedRewrite?: string;
}

export interface SuspendStep extends TraceStepBase {
  kind: 'suspend';
  reason: string;
  proposedActions: ProposedAction[];
  /** How the human was reached. Surfaced deliberately. */
  channel: 'signal' | 'web';
  /** Set when channel is 'web'. The column the decision is written to. */
  decisionColumn?: string;
}

export interface HumanDecisionStep extends TraceStepBase {
  kind: 'human_decision';
  channel: 'signal' | 'web';
  decision: 'approved' | 'rejected' | 'edited';
  /** The reply text, or null for a bare web approval. */
  body: string | null;
  senderLabel: string;
}

export interface ResumeStep extends TraceStepBase {
  kind: 'resume';
  approvedActionIds: string[];
  rejectedActionIds: string[];
  claimedVia: 'realtime_listener' | 'signal_listener';
}

export interface CommitStep extends TraceStepBase {
  kind: 'commit';
  table: string;
  rowSummary: Record<string, unknown>;
}

export interface WorkflowEndStep extends TraceStepBase {
  kind: 'workflow_end';
  status: 'success' | 'failed';
  outputSummary: Record<string, unknown>;
}

export type TraceStep =
  | WorkflowStartStep
  | AgentInvocationStep
  | ToolCallStep
  | DeterministicComputeStep
  | ComplianceVerdictStep
  | SuspendStep
  | HumanDecisionStep
  | ResumeStep
  | CommitStep
  | WorkflowEndStep;

export interface ProposedAction {
  id: string;
  summary: string;
  targetTable: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export interface RedactionRecord {
  stepIndex: number;
  field: string;
  reason: 'pii' | 'client_data' | 'credential' | 'internal_positioning';
}
