import { createScorer } from '@mastra/core/evals';
import type { Trajectory, TrajectoryStep, ToolCallStep } from '@mastra/core/evals';

/**
 * Trajectory scorer that returns 1 when the expected subagent tool was called
 * anywhere in the agent's tool-call trajectory, else 0.
 *
 * Mastra registers each subagent delegation as a tool call whose name is
 * `agent-<name>` (the hyphenated form is produced from the `agents:` map on
 * Simon — see CLAUDE.md). We walk the trajectory tree and return 1 if any
 * step (or nested child) matches.
 *
 * The expected subagent name (without the `agent-` prefix) is read from the
 * dataset item's `groundTruth.expectedSubagent` field.
 */
export const routedToAgentScorer = createScorer({
  id: 'routed-to-agent',
  description: 'Did Simon delegate to the expected subagent via an agent-<name> tool call?',
  type: 'trajectory',
}).generateScore(({ run }) => {
  const expected = (run.groundTruth as { expectedSubagent?: string } | undefined)?.expectedSubagent;
  if (!expected) return 0;
  const expectedTool = `agent-${expected}`;

  const trajectory = run.output as Trajectory | undefined;
  if (!trajectory?.steps) return 0;

  return hasToolCall(trajectory.steps, expectedTool) ? 1 : 0;
});

function hasToolCall(steps: TrajectoryStep[], expectedTool: string): boolean {
  for (const step of steps) {
    if (isToolCallStep(step) && step.name === expectedTool) return true;
    if (step.children && hasToolCall(step.children, expectedTool)) return true;
  }
  return false;
}

function isToolCallStep(step: TrajectoryStep): step is ToolCallStep {
  return (step as { stepType?: string }).stepType === 'tool_call';
}
