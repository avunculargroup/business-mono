import type { TraceStep } from './schema';

/** Above this, a gap is a wait rather than a step, and reads as one. */
export const COMPRESSION_CAP_MS = 1200;
/** Below this, a step fires too fast to see, and an invisible step teaches nothing. */
export const COMPRESSION_FLOOR_MS = 80;
/** Target total replay length. Beyond this a viewer stops watching. */
export const TARGET_TOTAL_MS = 45_000;
export const MAX_TOTAL_MS = 60_000;

/**
 * Real elapsed time → replay delay.
 *
 * Capped *and* floored. The cap is obvious; the floor is the one people leave
 * out. Steps that fire in two milliseconds are invisible during replay, and an
 * invisible step is a step the reader did not learn anything from — which
 * defeats the point of replaying at all.
 */
export function compress(offsetMs: number): number {
  if (offsetMs > COMPRESSION_CAP_MS) return COMPRESSION_CAP_MS;
  if (offsetMs < COMPRESSION_FLOOR_MS) return COMPRESSION_FLOOR_MS;
  return offsetMs;
}

/**
 * The suspend is the one gap that must not compress to the cap.
 *
 * A gate that waited four hours for a person is the single most important thing
 * in the trace, and rendering it as another 1200ms tick says the opposite of
 * what happened. It gets a longer, deliberately conspicuous pause — the machine
 * stopped, and the replay should stop too.
 */
export const SUSPEND_REPLAY_MS = 2600;

export function replayDelayFor(step: Pick<TraceStep, 'kind'>, offsetMs: number): number {
  return step.kind === 'suspend' ? SUSPEND_REPLAY_MS : compress(offsetMs);
}

/**
 * Scale every delay down if the compressed run would outlast the viewer.
 *
 * Proportional rather than dropping steps: a shorter replay that shows the
 * whole run is better than a punctual one that skips the part someone needed.
 */
export function fitToBudget(delays: number[], maxTotalMs = MAX_TOTAL_MS): number[] {
  const total = delays.reduce((sum, delay) => sum + delay, 0);
  if (total <= maxTotalMs) return delays;

  const scale = TARGET_TOTAL_MS / total;
  return delays.map((delay) => Math.max(COMPRESSION_FLOOR_MS, Math.round(delay * scale)));
}

/** Total replay length, for the UI to state up front. */
export function replayDurationMs(steps: readonly TraceStep[]): number {
  return steps.reduce((sum, step) => sum + step.replayDelayMs, 0);
}
