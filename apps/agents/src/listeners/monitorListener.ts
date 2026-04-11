import type { Mastra } from '@mastra/core/mastra';
import { MONITOR_CHECK_INTERVAL_MS } from '@platform/shared';

let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function runMonitorCheck(mastra: Mastra): Promise<void> {
  console.log('[monitor-listener] Running scheduled monitor check...');

  try {
    const run = await mastra.getWorkflow('monitorResearch').createRun();
    const result = await run.start({ inputData: { triggered_at: new Date().toISOString() } });
    console.log('[monitor-listener] Monitor check completed:', result);
  } catch (err) {
    console.error('[monitor-listener] Monitor check error:', err);
  }
}

/**
 * Starts an hourly interval that triggers the monitor research workflow.
 * Checks for research_monitors where next_run_at <= NOW().
 */
export function startMonitorListener(mastra: Mastra): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
  }

  console.log(
    `[monitor-listener] Starting monitor check interval (${MONITOR_CHECK_INTERVAL_MS / 1000}s)`,
  );

  // Run once immediately on startup, then on interval
  void runMonitorCheck(mastra);

  intervalHandle = setInterval(() => {
    void runMonitorCheck(mastra);
  }, MONITOR_CHECK_INTERVAL_MS);
}
