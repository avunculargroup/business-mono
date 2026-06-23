import { describe, it, expect } from 'vitest';
import { validateStrategyDecision } from './run.js';

describe('validateStrategyDecision', () => {
  it('accepts a gate1 approve, optionally with an edited strategy', () => {
    expect(validateStrategyDecision('gate1', { decision: 'approve' })).toMatchObject({
      decision: 'approve',
    });
    const edited = validateStrategyDecision('gate1', {
      decision: 'approve',
      strategy: { content_pillars: ['One pillar'] },
    });
    expect(edited?.decision).toBe('approve');
    expect((edited as { strategy?: { content_pillars: string[] } }).strategy?.content_pillars).toEqual([
      'One pillar',
    ]);
  });

  it('accepts a gate1 request_change with an instruction', () => {
    expect(
      validateStrategyDecision('gate1', { decision: 'request_change', instruction: 'sharper pillars' }),
    ).toMatchObject({ decision: 'request_change', instruction: 'sharper pillars' });
  });

  it('accepts a gate2 approve with edited beats', () => {
    const out = validateStrategyDecision('gate2', {
      decision: 'approve',
      beats: [{ core_message: 'The one idea' }],
    });
    expect(out?.decision).toBe('approve');
    expect((out as { beats?: Array<{ core_message: string }> }).beats?.[0]?.core_message).toBe(
      'The one idea',
    );
  });

  it('rejects a malformed payload at either gate', () => {
    expect(validateStrategyDecision('gate1', null)).toBeNull();
    expect(validateStrategyDecision('gate1', { decision: 'publish' })).toBeNull();
    expect(validateStrategyDecision('gate2', 'approve')).toBeNull();
  });
});
