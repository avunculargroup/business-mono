import { describe, it, expect } from 'vitest';
import { nextBrandVisualVersion } from './brandVisual.js';

// buildImagePrompt and lintImageBrief are covered against the seeded canon in
// apps/agents (imagePrompt.test.ts, imageBrief.test.ts), where the fixture lives.

describe('nextBrandVisualVersion', () => {
  it('bumps the minor version numerically', () => {
    expect(nextBrandVisualVersion('1.0')).toBe('1.1');
    expect(nextBrandVisualVersion('1.9')).toBe('1.10');
    expect(nextBrandVisualVersion(' 2.3 ')).toBe('2.4');
  });

  it('restarts a malformed version at 1.0', () => {
    expect(nextBrandVisualVersion('v1')).toBe('1.0');
  });
});
