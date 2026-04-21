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
 * Starts an hourly interval that triggers the execute-routine workflow.
 * Checks for routines where is_active AND next_run_at <= NOW().
 */
export function startRoutineListener(mastra: Mastra): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
  }

  console.log(
    `[routine-listener] Starting routine check interval (${ROUTINE_CHECK_INTERVAL_MS / 1000}s)`,
  );

  void runRoutineCheck(mastra);

  intervalHandle = setInterval(() => {
    void runRoutineCheck(mastra);
  }, ROUTINE_CHECK_INTERVAL_MS);
}
