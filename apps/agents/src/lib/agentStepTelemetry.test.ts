import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the structured logger the module binds at import time. vi.hoisted runs
// before the hoisted vi.mock factory, so the spy exists when createLogger fires.
const { infoSpy } = vi.hoisted(() => ({ infoSpy: vi.fn() }));
vi.mock('./logger.js', () => ({
  createLogger: () => ({ info: infoSpy, warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { makeStepLogger } from './agentStepTelemetry.js';

describe('makeStepLogger', () => {
  beforeEach(() => infoSpy.mockClear());

  it('summarise logs zero-step message when no events fired', () => {
    const logger = makeStepLogger('agent/run-1');
    logger.summarise();
    expect(infoSpy).toHaveBeenCalledWith(
      { label: 'agent/run-1' },
      '0 steps (generate aborted before first step)',
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

    const summaryCall = infoSpy.mock.calls.find((c) => c[1] === 'step telemetry summary');
    expect(summaryCall).toBeDefined();
    const payload = summaryCall![0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      label: 'charlie/abc',
      steps: 2,
      tools: { 'agent-rex': 2, supabase_query: 1 },
      tokensIn: 180,
      tokensOut: 70,
      finish: 'stop',
    });
  });

  it('reads toolName from payload when present at top level is missing', () => {
    const logger = makeStepLogger('test/1');
    logger.onStepFinish({
      toolCalls: [{ payload: { toolName: 'nested-tool' } }],
      response: { timestamp: new Date() },
    });
    logger.summarise();
    const summaryCall = infoSpy.mock.calls.find((c) => c[1] === 'step telemetry summary');
    expect((summaryCall![0] as { tools: Record<string, number> }).tools).toMatchObject({
      'nested-tool': 1,
    });
  });
});
