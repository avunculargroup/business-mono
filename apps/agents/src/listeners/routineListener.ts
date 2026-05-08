import type { Mastra } from '@mastra/core/mastra';
import { ROUTINE_CHECK_INTERVAL_MS } from '@platform/shared';

let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function runRoutineCheck(mastra: Mastra): Promise<void> {
  console.log('[routine-listener] Running scheduled routine check...');

  try {
    const run = await mastra.getWorkflow('executeRoutine').createRun();
    const result = await run.start({ inputData: { triggered_at: new Date().toISOString() } });
    console.log('[routine-listener] Routine check completed:', result);
  } catch (err) {
    console.error('[routine-listener] Routine check error:', err);
  }
}

/**
 * Starts a recurring interval that triggers the execute-routine workflow.
 * Checks for routines where is_active AND next_run_at <= NOW().
 * Interval is configured by ROUTINE_CHECK_INTERVAL_MS — short enough that a
 * routine fires within that window of its scheduled wall-clock time.
 */
export function startRoutineListener(mastra: Mastra): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
  }

  const minutes = ROUTINE_CHECK_INTERVAL_MS / 60000;
  console.log(`[routine-listener] Starting routine check interval (every ${minutes}m)`);

  void runRoutineCheck(mastra);

  intervalHandle = setInterval(() => {
    void runRoutineCheck(mastra);
  }, ROUTINE_CHECK_INTERVAL_MS);
}
