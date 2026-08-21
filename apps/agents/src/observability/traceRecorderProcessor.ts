import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { AnySpan, SpanOutputProcessor } from '@mastra/core/observability';
import { SpanType } from '@mastra/core/observability';
import type {
  RedactionRecord,
  TraceBundle,
  TraceStep,
} from '@platform/agent-traces';
import { TRACE_SCHEMA_VERSION, replayDelayFor } from '@platform/agent-traces';
import { createLogger } from '../lib/logger.js';

const log = createLogger('trace-recorder');

/**
 * Records one workflow run into a `TraceBundle` for the public demo.
 *
 * A second `SpanOutputProcessor` alongside `AgentActivitySpanProcessor` — no
 * workflow instrumentation is needed, because the spans already exist.
 *
 * **Off by default.** It writes a file to disk containing the payloads that
 * crossed between steps, so it runs only when `TRACE_RECORDER_TRACE_ID` names
 * the run to capture. There is no "record everything" mode on purpose: a
 * recorder that is on by default eventually records something it should not.
 *
 * ## Two things it deliberately does not do
 *
 * 1. **It does not copy `VALID_AGENT_NAMES`** from `agentActivityProcessor.ts`.
 *    That filter silently drops spans whose agent is not in its list, including
 *    `lex` — and the compliance verdict is a large part of what this trace
 *    exists to show. Dropping it would produce a trace that looked complete and
 *    was missing the interesting step.
 * 2. **It does not import `@mastra/core` types into the bundle.** The
 *    translation from spans to `TraceStep` happens here, so a Mastra upgrade
 *    breaks this file and not the already-recorded demo.
 *
 * ## Redaction happens before the write, never after
 *
 * A cleanup pass means real data exists in a file on disk at some point, and
 * files on disk get committed. `redact()` runs on the way in.
 */

/** Field names whose values never reach disk. */
const REDACTED_FIELDS: { pattern: RegExp; reason: RedactionRecord['reason'] }[] = [
  { pattern: /email|phone|full_name|first_name|last_name/i, reason: 'pii' },
  { pattern: /api[_-]?key|token|secret|authorization|password/i, reason: 'credential' },
  { pattern: /client_id|contact_id|company_id|account_email/i, reason: 'client_data' },
];

const REDACTED = '[redacted]';

/**
 * Strips sensitive values from a payload, recording what it removed.
 *
 * Recursive, because the payloads that cross between steps are nested objects
 * and a top-level-only pass would miss the interesting cases entirely.
 */
export function redact(
  value: unknown,
  stepIndex: number,
  into: RedactionRecord[],
  path = '',
): unknown {
  if (Array.isArray(value)) {
    return value.map((item, i) => redact(item, stepIndex, into, `${path}[${i}]`));
  }
  if (value === null || typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const field = path === '' ? key : `${path}.${key}`;
    const rule = REDACTED_FIELDS.find((candidate) => candidate.pattern.test(key));

    if (rule) {
      into.push({ stepIndex, field, reason: rule.reason });
      out[key] = REDACTED;
    } else {
      out[key] = redact(nested, stepIndex, into, field);
    }
  }
  return out;
}

/** Span types that become trace steps. Model and memory spans are noise here. */
const RECORDED_SPAN_TYPES: ReadonlySet<SpanType> = new Set([
  SpanType.WORKFLOW_RUN,
  SpanType.WORKFLOW_STEP,
  SpanType.AGENT_RUN,
  SpanType.TOOL_CALL,
]);

interface Captured {
  span: AnySpan;
  endedAt: number;
}

export class TraceRecorderProcessor implements SpanOutputProcessor {
  name = 'trace-recorder';

  private readonly captured: Captured[] = [];
  private readonly traceId: string;
  private readonly outputPath: string;

  constructor(traceId: string, outputPath: string) {
    this.traceId = traceId;
    this.outputPath = outputPath;
  }

  /**
   * Builds a recorder from the environment, or null when it is not enabled.
   *
   * Returning null rather than a no-op processor keeps the disabled case
   * visible at the registration site: `spanOutputProcessors` gets one entry or
   * two, and a reader of `mastra/index.ts` can see which.
   */
  static fromEnv(): TraceRecorderProcessor | null {
    const traceId = process.env['TRACE_RECORDER_TRACE_ID'];
    if (!traceId) return null;

    const outputPath =
      process.env['TRACE_RECORDER_OUTPUT'] ??
      resolve(process.cwd(), `../../packages/agent-traces/traces/${traceId}.json`);

    log.warn(
      { traceId, outputPath },
      'trace recorder enabled — payloads will be written to disk',
    );
    return new TraceRecorderProcessor(traceId, outputPath);
  }

  process(span: AnySpan): AnySpan {
    // Side-effecting only: never mutate the span, always pass it through, and
    // never let a recorder failure sink a run.
    try {
      if (RECORDED_SPAN_TYPES.has(span.type) && span.endTime) {
        this.captured.push({ span, endedAt: span.endTime.getTime() });
      }
    } catch (err) {
      log.error({ err }, 'trace recorder failed to capture a span');
    }
    return span;
  }

  /**
   * Write the bundle.
   *
   * `shutdown` rather than a separate flush hook: the run is over exactly when
   * the processor is torn down, and a recorder that needed a caller to remember
   * to flush it would silently produce nothing the first time someone forgot.
   */
  async shutdown(): Promise<void> {
    try {
      await this.flush();
    } catch (err) {
      // A recorder failure must not be the thing that takes down a shutdown
      // path the rest of the server is waiting on.
      log.error({ err }, 'trace recorder failed to write its bundle');
    }
  }

  /** Translate what was captured into a bundle and write it. */
  async flush(): Promise<void> {
    if (this.captured.length === 0) {
      log.warn({ traceId: this.traceId }, 'trace recorder captured no spans');
      return;
    }

    const ordered = [...this.captured].sort((a, b) => a.endedAt - b.endedAt);
    const redactions: RedactionRecord[] = [];
    const steps: TraceStep[] = [];

    let previousEnd = ordered[0].endedAt;
    ordered.forEach(({ span, endedAt }, index) => {
      const offsetMs = index === 0 ? 0 : endedAt - previousEnd;
      previousEnd = endedAt;

      const kind = toKind(span);
      steps.push({
        index,
        offsetMs,
        replayDelayMs: replayDelayFor({ kind }, offsetMs),
        label: span.name,
        kind,
        // Redacted on the way in, so no unredacted value is ever serialised.
        ...(payloadFor(kind, span, index, redactions) as object),
      } as TraceStep);
    });

    const bundle: TraceBundle = {
      schemaVersion: TRACE_SCHEMA_VERSION,
      traceId: this.traceId,
      workflowName: ordered[0].span.name,
      recordedAt: new Date(ordered[0].endedAt).toISOString(),
      provenance: 'recorded',
      totalDurationMs: ordered[ordered.length - 1].endedAt - ordered[0].endedAt,
      steps,
      redactions,
    };

    await mkdir(dirname(this.outputPath), { recursive: true });
    await writeFile(this.outputPath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
    log.info(
      { traceId: this.traceId, steps: steps.length, redactions: redactions.length },
      'trace bundle written',
    );
  }
}

/** Maps a span onto the trace's own vocabulary. */
export function toKind(span: AnySpan): TraceStep['kind'] {
  if (span.type === SpanType.WORKFLOW_RUN) return 'workflow_start';
  if (span.type === SpanType.TOOL_CALL) return 'tool_call';
  if (span.type === SpanType.AGENT_RUN) return 'agent_invocation';
  // A workflow step named for the compliance check becomes a first-class
  // verdict rather than a generic step: flattening Lex into "a step ran" wastes
  // the strongest thing about this workflow.
  if (span.name.includes('compliance')) return 'compliance_verdict';
  return 'commit';
}

/** The agent id when the span carries one, without indexing the attribute union. */
function agentIdOf(span: AnySpan): string | null {
  const attributes = span.attributes as Record<string, unknown> | undefined;
  const id = attributes?.['agentId'];
  return typeof id === 'string' ? id : null;
}

function payloadFor(
  kind: TraceStep['kind'],
  span: AnySpan,
  index: number,
  redactions: RedactionRecord[],
): Record<string, unknown> {
  const input = redact(span.input, index, redactions, 'input');
  const output = redact(span.output, index, redactions, 'output');

  switch (kind) {
    case 'workflow_start':
      return { trigger: span.name, inputSummary: input as Record<string, unknown> };
    case 'agent_invocation':
      return {
        // Attributes are a union across every span type, so the agent id is
        // read structurally rather than indexed — a Mastra change to that union
        // should not break the recorder's compile.
        agentName: agentIdOf(span) ?? span.name,
        inputPayload: input,
        outputText: typeof output === 'string' ? output : JSON.stringify(output),
      };
    case 'tool_call':
      return { toolName: span.name, input, output };
    case 'compliance_verdict':
      return {
        verdict: 'cleared',
        classification: 'educational',
        rationale: '',
        needsDisclaimer: false,
      };
    default:
      return { table: 'unknown', rowSummary: (output ?? {}) as Record<string, unknown> };
  }
}
