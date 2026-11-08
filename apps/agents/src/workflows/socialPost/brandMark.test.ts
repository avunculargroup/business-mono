import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { BTS_MARK_SVG } from './brandMark.js';

// Drift guard: the composited mark must be the design skill's mark, byte for byte.
// Change both in the same commit.
const SKILL_SVG = join(import.meta.dirname, '..', '..', '..', '..', '..', '.claude/skills/bts-design/assets/bts-logo.svg');

describe('BTS_MARK_SVG', () => {
  it('is identical to the bts-design skill asset', () => {
    expect(BTS_MARK_SVG).toBe(readFileSync(SKILL_SVG, 'utf8'));
  });
});
