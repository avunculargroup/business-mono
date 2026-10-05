import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('unpdf', () => ({ extractText: vi.fn(), getMeta: vi.fn() }));

type MathWithSum = Math & { sumPrecise?: (xs: Iterable<number>) => number };
const original = (Math as MathWithSum).sumPrecise;

afterEach(() => {
  (Math as MathWithSum).sumPrecise = original;
  vi.resetModules();
});

describe('Math.sumPrecise polyfill', () => {
  it('installs a summing Math.sumPrecise when the runtime lacks one', async () => {
    delete (Math as MathWithSum).sumPrecise;
    await import('./pdfText.js');
    expect((Math as MathWithSum).sumPrecise?.([4, 8, 12])).toBe(24);
    expect((Math as MathWithSum).sumPrecise?.(new Set([1, 2]))).toBe(3);
  });

  it('leaves a native Math.sumPrecise alone', async () => {
    const native = vi.fn(() => 0);
    (Math as MathWithSum).sumPrecise = native;
    await import('./pdfText.js');
    expect((Math as MathWithSum).sumPrecise).toBe(native);
  });
});
