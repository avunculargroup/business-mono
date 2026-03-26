import { MONITOR_CHECK_INTERVAL_MS } from '@platform/shared';
import { monitorResearchWorkflow } from '../agents/researcher/workflow.js';

let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function runMonitorCheck(): Promise<void> {
  console.log('[monitor-listener] Running scheduled monitor check...');

  try {
    const run = await monitorResearchWorkflow.execute({
      inputData: { triggered_at: new Date().toISOString() },
    });
    console.log('[monitor-listener] Monitor check completed:', run);
  } catch (err) {
    console.error('[monitor-listener] Monitor check error:', err);
  }
}

/**
 * Starts an hourly interval that triggers the monitor research workflow.
 * Checks for research_monitors where next_run_at <= NOW().
 */
export function startMonitorListener(): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
  }

  console.log(
    `[monitor-listener] Starting monitor check interval (${MONITOR_CHECK_INTERVAL_MS / 1000}s)`,
  );

  // Run once immediately on startup, then on interval
  void runMonitorCheck();

  intervalHandle = setInterval(() => {
    void runMonitorCheck();
  }, MONITOR_CHECK_INTERVAL_MS);
}
