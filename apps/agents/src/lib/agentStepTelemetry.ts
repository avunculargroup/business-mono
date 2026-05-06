// Lightweight per-step telemetry for `agent.generate()`. Mastra exposes
// `onStepFinish: MastraOnStepFinishCallback` (see
// node_modules/@mastra/core/dist/stream/types.d.ts) which fires after each
// step in the agent loop with a full LLMStepResult payload. We capture a
// compact summary per step and log one aggregate line at end-of-run.
//
// Output goes to console.log (Railway logs) — no DB writes. The label
// should include the agent name and a correlator (traceId or runId) so
// the log line joins to existing agent_activity rows.

type StepSummary = {
  idx: number;
  toolNames: string[];
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string;
  dtMs?: number;
};

// Mastra's onStepFinish event shape varies slightly between versions; pull
// fields defensively rather than coupling to the imported type.
type StepEvent = {
  toolCalls?: Array<{ toolName?: string; payload?: { toolName?: string } }>;
  usage?: { inputTokens?: number; outputTokens?: number };
  finishReason?: string;
  response?: { timestamp?: Date };
};

export type StepLogger = {
  onStepFinish: (event: StepEvent) => void;
  summarise: () => void;
};

export function makeStepLogger(label: string): StepLogger {
  const steps: StepSummary[] = [];
  let lastTs: number | null = null;

  const onStepFinish = (event: StepEvent): void => {
    const now =
      event?.response?.timestamp instanceof Date
        ? event.response.timestamp.getTime()
        : Date.now();
    const dtMs = lastTs == null ? undefined : now - lastTs;
    lastTs = now;
    const toolNames = (event?.toolCalls ?? [])
      .map((c) => c?.toolName ?? c?.payload?.toolName ?? '?')
      .filter((n): n is string => typeof n === 'string');
    steps.push({
      idx: steps.length,
      toolNames,
      inputTokens: event?.usage?.inputTokens,
      outputTokens: event?.usage?.outputTokens,
      finishReason: event?.finishReason,
      dtMs,
    });
  };

  const summarise = (): void => {
    if (steps.length === 0) {
      console.log(`[step-telemetry ${label}] 0 steps (generate aborted before first step)`);
      return;
    }
    const totalMs = steps.reduce((a, s) => a + (s.dtMs ?? 0), 0);
    const toolCounts: Record<string, number> = {};
    for (const s of steps) {
      for (const t of s.toolNames) {
        toolCounts[t] = (toolCounts[t] ?? 0) + 1;
      }
    }
    const inSum = steps.reduce((a, s) => a + (s.inputTokens ?? 0), 0);
    const outSum = steps.reduce((a, s) => a + (s.outputTokens ?? 0), 0);
    const finish = steps.at(-1)?.finishReason ?? 'unknown';
    console.log(
      `[step-telemetry ${label}] ${steps.length} steps, ${(totalMs / 1000).toFixed(1)}s, ` +
        `tools=${JSON.stringify(toolCounts)}, finish=${finish}, ` +
        `tokens in/out=${inSum}/${outSum}`,
    );
    console.log(`[step-telemetry ${label}] per-step:`, steps);
  };

  return { onStepFinish, summarise };
}
