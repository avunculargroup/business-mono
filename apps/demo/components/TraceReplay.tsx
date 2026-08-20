'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import type { TraceBundle, TraceStep } from '@platform/agent-traces';
import { replayDurationMs } from '@platform/agent-traces';
import styles from './TraceReplay.module.css';

/**
 * Replays a recorded workflow run, step by step.
 *
 * The demo's centrepiece: an evaluator who clicks exactly one thing should
 * click this. What it has to convey in forty-five seconds is the shape of the
 * run — deterministic work committed first, an agent handed only that payload,
 * a compliance verdict with a reason, and a gate where the machine stopped and
 * waited for a person.
 *
 * Position is a step index rather than a timer offset. Every control moves the
 * index, and the only thing the timer does is advance it — so stepping back
 * across the gate boundary is the same operation as stepping forward, and there
 * is no separate seek path that can disagree with playback.
 */
export function TraceReplay({ trace }: { trace: TraceBundle }) {
  // -1 is "nothing has happened yet", which is a real state: the run had a
  // beginning and the replay should start before it rather than inside it.
  const [position, setPosition] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStep = trace.steps.length - 1;

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    if (!playing) return;
    if (position >= lastStep) {
      setPlaying(false);
      return;
    }

    const next = trace.steps[position + 1];
    timer.current = setTimeout(() => setPosition((current) => current + 1), next.replayDelayMs);
    return clear;
  }, [playing, position, lastStep, trace.steps, clear]);

  const go = useCallback(
    (to: number) => {
      clear();
      setPlaying(false);
      setPosition(Math.max(-1, Math.min(lastStep, to)));
    },
    [clear, lastStep],
  );

  const atEnd = position >= lastStep;

  return (
    <div className={styles.layout}>
      <div>
        <div className={styles.transport} role="group" aria-label="Replay controls">
          <button
            type="button"
            className={`${styles.control} ${styles.controlPrimary}`}
            onClick={() => (atEnd ? go(-1) : setPlaying((current) => !current))}
          >
            {atEnd ? (
              <>
                <RotateCcw size={16} strokeWidth={1.5} aria-hidden /> Replay
              </>
            ) : playing ? (
              <>
                <Pause size={16} strokeWidth={1.5} aria-hidden /> Pause
              </>
            ) : (
              <>
                <Play size={16} strokeWidth={1.5} aria-hidden /> Play
              </>
            )}
          </button>

          <button
            type="button"
            className={styles.control}
            onClick={() => go(position - 1)}
            disabled={position < 0}
          >
            <SkipBack size={16} strokeWidth={1.5} aria-hidden /> Step back
          </button>

          <button
            type="button"
            className={styles.control}
            onClick={() => go(position + 1)}
            disabled={atEnd}
          >
            <SkipForward size={16} strokeWidth={1.5} aria-hidden /> Step forward
          </button>

          <span className={styles.position} aria-live="polite">
            step {Math.max(0, position + 1)} of {trace.steps.length}
          </span>
        </div>

        {/* Playback is a preview, not the reading experience. Twelve steps
            compress to about seven seconds, which is long enough to see the
            shape of the run and far too short to read the payloads — so the
            step controls are the point, and saying so beats letting someone
            watch it once and conclude there was nothing to read. */}
        <p className={styles.hint}>
          Play gives you the shape of the run in a few seconds. Step through it to read what
          actually crossed between the steps.
        </p>

        <ol className={styles.steps}>
          {trace.steps.map((step, index) => (
            <StepRow
              key={step.index}
              step={step}
              previous={trace.steps[index - 1]}
              seen={index <= position}
              current={index === position}
            />
          ))}
        </ol>
      </div>

      <aside className={styles.side}>
        <div className={styles.sideTitle}>This run</div>
        <p className={styles.fact}>
          <strong>{trace.workflowName}</strong>
          {trace.steps.length} steps
        </p>
        <p className={styles.fact}>
          <strong>Real elapsed time</strong>
          {formatDuration(trace.totalDurationMs)}
        </p>
        <p className={styles.fact}>
          <strong>Replay length</strong>
          {Math.round(replayDurationMs(trace.steps) / 1000)} seconds
        </p>
        <p className={styles.fact}>
          <strong>Redactions</strong>
          {/* The empty case has two different meanings and must not blur them.
              A recorded run with zero redactions is a claim about scope; an
              authored bundle with zero is a claim about nothing at all. */}
          {trace.redactions.length > 0
            ? `${trace.redactions.length} fields removed before this was written to disk.`
            : trace.provenance === 'recorded'
              ? 'None — recorded against a synthetic campaign, so no client data was in scope.'
              : 'Not applicable — nothing was recorded, so there was nothing to redact.'}
        </p>

        {/* Stated plainly rather than buried. The value of a trace over a
            mockup is that it is a real run, and a bundle that let a reader
            assume it was recorded when it was not would give that value away
            dishonestly. */}
        <p className={styles.provenance}>
          {trace.provenance === 'recorded'
            ? `Recorded from a real run on ${new Date(trace.recordedAt).toISOString().slice(0, 10)}.`
            : 'Authored against the workflow source, not captured from a live run. The recorder that produces the real thing ships in apps/agents; this bundle is a placeholder for its output.'}
        </p>
      </aside>
    </div>
  );
}

function StepRow({
  step,
  previous,
  seen,
  current,
}: {
  step: TraceStep;
  previous: TraceStep | undefined;
  seen: boolean;
  current: boolean;
}) {
  // The boundary is drawn between the two steps rather than on either, because
  // the claim is about what crosses it.
  const isBoundary =
    step.kind === 'agent_invocation' && previous?.kind === 'deterministic_compute';

  return (
    <>
      {isBoundary ? (
        <li className={styles.boundary} aria-hidden={!seen}>
          Everything above was computed and committed. Only the payload crosses.
        </li>
      ) : null}
      <li
        className={[
          styles.step,
          seen ? styles.stepSeen : '',
          current ? styles.stepCurrent : '',
          step.kind === 'suspend' ? styles.suspend : '',
          step.kind === 'compliance_verdict'
            ? step.verdict === 'cleared'
              ? styles.verdictCleared
              : styles.verdictFlagged
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-annotation-id={step.annotationId}
        aria-current={current ? 'step' : undefined}
      >
        <div className={styles.stepHead}>
          <span className={styles.stepIndex}>{String(step.index + 1).padStart(2, '0')}</span>
          <span className={styles.stepLabel}>{step.label}</span>
          <span className={styles.stepKind}>{step.kind}</span>
        </div>
        <StepBody step={step} />
      </li>
    </>
  );
}

function StepBody({ step }: { step: TraceStep }) {
  switch (step.kind) {
    case 'workflow_start':
      return (
        <>
          <p className={styles.stepBody}>{step.trigger}</p>
          <pre className={styles.payload}>{JSON.stringify(step.inputSummary, null, 2)}</pre>
        </>
      );

    case 'deterministic_compute':
      return (
        <>
          <p className={styles.stepBody}>{step.description}</p>
          <div className={styles.counts}>
            <span>{step.inputCount} in</span>
            <span>{step.outputCount} out</span>
          </div>
          <pre className={styles.payload}>{JSON.stringify(step.payload, null, 2)}</pre>
        </>
      );

    case 'agent_invocation':
      return (
        <>
          <p className={styles.stepBody}>{step.agentName} received:</p>
          <pre className={styles.payload}>{JSON.stringify(step.inputPayload, null, 2)}</pre>
          <p className={styles.stepBody}>{step.outputText}</p>
        </>
      );

    case 'compliance_verdict':
      return (
        <>
          <p className={styles.stepBody}>
            {step.verdict} — {step.classification}
            {step.needsDisclaimer ? ', disclaimer required' : ''}
          </p>
          <p className={styles.stepBody}>{step.rationale}</p>
          {step.suggestedRewrite ? (
            <p className={styles.stepBody}>Suggested rewrite: {step.suggestedRewrite}</p>
          ) : null}
        </>
      );

    case 'suspend':
      return (
        <>
          <p className={styles.stepBody}>{step.reason}</p>
          {step.decisionColumn ? (
            <p className={styles.stepBody}>
              The agent server is not reachable over HTTP from the web app, so the decision
              travels through a database column: {step.decisionColumn}.
            </p>
          ) : null}
          <ul className={styles.stepBody}>
            {step.proposedActions.map((action) => (
              <li key={action.id}>{action.summary}</li>
            ))}
          </ul>
        </>
      );

    case 'human_decision':
      return (
        <p className={styles.stepBody}>
          {step.senderLabel} {step.decision} it, via the {step.channel} gate.
          {/* No invented reply text: a web decision is not a message, and a chat
              bubble here would be a fabrication. */}
          {step.body ? ` “${step.body}”` : ''}
        </p>
      );

    case 'resume':
      return (
        <p className={styles.stepBody}>
          Claimed by the {step.claimedVia.replace('_', ' ')} and resumed.{' '}
          {step.approvedActionIds.length} action approved,{' '}
          {step.rejectedActionIds.length} not taken.
        </p>
      );

    case 'commit':
      return (
        <>
          <p className={styles.stepBody}>Wrote to {step.table}.</p>
          <pre className={styles.payload}>{JSON.stringify(step.rowSummary, null, 2)}</pre>
        </>
      );

    case 'tool_call':
      return (
        <>
          <p className={styles.stepBody}>{step.toolName}</p>
          <pre className={styles.payload}>{JSON.stringify(step.output, null, 2)}</pre>
        </>
      );

    case 'workflow_end':
      return (
        <>
          <p className={styles.stepBody}>Finished: {step.status}.</p>
          <pre className={styles.payload}>{JSON.stringify(step.outputSummary, null, 2)}</pre>
        </>
      );
  }
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.round((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.round(ms / 1000)}s`;
}
