import { describe, it, expect, vi } from 'vitest';
import { runPrune } from './pruneStorageWorkflow.js';

describe('runPrune', () => {
  it('sums deletions across tables and stops after one pass when all report done', async () => {
    const prune = vi.fn().mockResolvedValue([
      { domain: 'memory', table: 'mastra_messages', deleted: 5, done: true },
      { domain: 'observability', table: 'mastra_spans', deleted: 3, done: true },
    ]);

    const result = await runPrune({ prune });

    expect(result).toEqual({ deleted: 8, passes: 1, done: true });
    expect(prune).toHaveBeenCalledTimes(1);
  });

  it('loops until no table reports done:false', async () => {
    const prune = vi
      .fn()
      .mockResolvedValueOnce([{ deleted: 1000, done: false }])
      .mockResolvedValueOnce([{ deleted: 200, done: true }]);

    const result = await runPrune({ prune });

    expect(result).toEqual({ deleted: 1200, passes: 2, done: true });
    expect(prune).toHaveBeenCalledTimes(2);
  });

  it('stops at the pass cap and reports done:false when a backlog remains', async () => {
    const prune = vi.fn().mockResolvedValue([{ deleted: 10, done: false }]);

    const result = await runPrune({ prune }, 3);

    expect(result).toEqual({ deleted: 30, passes: 3, done: false });
    expect(prune).toHaveBeenCalledTimes(3);
  });

  it('treats an empty result as done (no retention configured / nothing eligible)', async () => {
    const prune = vi.fn().mockResolvedValue([]);

    const result = await runPrune({ prune });

    expect(result).toEqual({ deleted: 0, passes: 1, done: true });
    expect(prune).toHaveBeenCalledTimes(1);
  });
});
