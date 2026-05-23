import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { makeStepLogger } from './agentStepTelemetry.js';

describe('makeStepLogger', () => {
  let logSpy: MockInstance<(...args: unknown[]) => void>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => logSpy.mockRestore());

  it('summarise logs zero-step message when no events fired', () => {
    const logger = makeStepLogger('agent/run-1');
    logger.summarise();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('0 steps (generate aborted before first step)'),
    );
  });

  it('summarise aggregates tool counts and token totals across steps', () => {
    const logger = makeStepLogger('charlie/abc');

    logger.onStepFinish({
      toolCalls: [{ toolName: 'agent-rex' }, { toolName: 'supabase_query' }],
      usage: { inputTokens: 100, outputTokens: 50 },
      finishReason: 'tool-calls',
      response: { timestamp: new Date('2026-01-01T00:00:00Z') },
    });
    logger.onStepFinish({
      toolCalls: [{ toolName: 'agent-rex' }],
      usage: { inputTokens: 80, outputTokens: 20 },
      finishReason: 'stop',
      response: { timestamp: new Date('2026-01-01T00:00:01Z') },
    });

    logger.summarise();

    const summaryCall = logSpy.mock.calls.find((c) =>
      typeof c[0] === 'string' && c[0].includes('2 steps'),
    );
    expect(summaryCall).toBeDefined();
    const line = summaryCall![0] as string;
    expect(line).toContain('"agent-rex":2');
    expect(line).toContain('"supabase_query":1');
    expect(line).toContain('tokens in/out=180/70');
    expect(line).toContain('finish=stop');
  });

  it('reads toolName from payload when present at top level is missing', () => {
    const logger = makeStepLogger('test/1');
    logger.onStepFinish({
      toolCalls: [{ payload: { toolName: 'nested-tool' } }],
      response: { timestamp: new Date() },
    });
    logger.summarise();
    const line = logSpy.mock.calls.find((c) => typeof c[0] === 'string' && (c[0] as string).includes('1 steps'))?.[0];
    expect(line).toContain('"nested-tool":1');
  });
});
