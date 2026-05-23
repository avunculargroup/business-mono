import { describe, it, expect } from 'vitest';
import type { Trajectory, TrajectoryStep } from '@mastra/core/evals';
import { routedToAgentScorer } from './routedToAgent.js';

function trajectory(steps: TrajectoryStep[]): Trajectory {
  return { steps };
}

async function score(traj: Trajectory, expectedSubagent: string): Promise<number> {
  const result = await routedToAgentScorer.run({
    output: traj,
    groundTruth: { expectedSubagent },
  });
  return result.score as number;
}

describe('routedToAgentScorer', () => {
  it('scores 1 when the expected agent-<name> tool call is in the trajectory', async () => {
    const traj = trajectory([
      { stepType: 'model_generation', name: 'gen-1' } as TrajectoryStep,
      { stepType: 'tool_call', name: 'agent-charlie' } as TrajectoryStep,
    ]);
    expect(await score(traj, 'charlie')).toBe(1);
  });

  it('finds the tool call in nested children', async () => {
    const traj = trajectory([
      {
        stepType: 'agent_run',
        name: 'simon',
        children: [
          { stepType: 'tool_call', name: 'agent-rex' } as TrajectoryStep,
        ],
      } as TrajectoryStep,
    ]);
    expect(await score(traj, 'rex')).toBe(1);
  });

  it('scores 0 when the wrong subagent was called', async () => {
    const traj = trajectory([
      { stepType: 'tool_call', name: 'agent-rex' } as TrajectoryStep,
    ]);
    expect(await score(traj, 'charlie')).toBe(0);
  });

  it('scores 0 when only non-tool steps are present', async () => {
    const traj = trajectory([
      { stepType: 'model_generation', name: 'gen-1' } as TrajectoryStep,
    ]);
    expect(await score(traj, 'charlie')).toBe(0);
  });

  it('scores 0 when expectedSubagent is missing from groundTruth', async () => {
    const result = await routedToAgentScorer.run({
      output: trajectory([{ stepType: 'tool_call', name: 'agent-charlie' } as TrajectoryStep]),
      groundTruth: {},
    });
    expect(result.score).toBe(0);
  });
});
