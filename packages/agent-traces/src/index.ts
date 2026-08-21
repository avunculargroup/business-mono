/**
 * Recorded (and, for now, authored) agent workflow traces.
 *
 * Bundles are imported statically rather than fetched. The demo must work with
 * the network disabled, and a trace fetched at runtime is one more thing that
 * can fail while someone is watching it.
 *
 * This package depends on nothing — not even `@mastra/core`, deliberately. See
 * `schema.ts`.
 */
export {
  TRACE_SCHEMA_VERSION,
  type AgentInvocationStep,
  type CommitStep,
  type ComplianceVerdictStep,
  type DeterministicComputeStep,
  type HumanDecisionStep,
  type ProposedAction,
  type RedactionRecord,
  type ResumeStep,
  type SuspendStep,
  type ToolCallStep,
  type TraceBundle,
  type TraceStep,
  type TraceStepBase,
  type WorkflowEndStep,
  type WorkflowStartStep,
} from './schema';
export {
  COMPRESSION_CAP_MS,
  COMPRESSION_FLOOR_MS,
  MAX_TOTAL_MS,
  SUSPEND_REPLAY_MS,
  TARGET_TOTAL_MS,
  compress,
  fitToBudget,
  replayDelayFor,
  replayDurationMs,
} from './timing';
export { variantGateWebTrace } from './traces/variantGateWeb';

import type { TraceBundle } from './schema';
import { variantGateWebTrace } from './traces/variantGateWeb';

const BUNDLES: Record<string, TraceBundle> = {
  [variantGateWebTrace.traceId]: variantGateWebTrace,
};

export function getTrace(traceId: string): TraceBundle | null {
  return BUNDLES[traceId] ?? null;
}

export function listTraces(): TraceBundle[] {
  return Object.values(BUNDLES);
}
