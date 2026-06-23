import { describe, it, expect } from 'vitest';
import { validateVariantDecision } from './run.js';

describe('validateVariantDecision', () => {
  it('accepts a plain approve', () => {
    expect(validateVariantDecision({ decision: 'approve' })).toEqual({ decision: 'approve' });
  });

  it('accepts approve with an approver id', () => {
    const approvedBy = '00000000-0000-0000-0000-000000000009';
    expect(validateVariantDecision({ decision: 'approve', approvedBy })).toMatchObject({
      decision: 'approve',
      approvedBy,
    });
  });

  it('accepts request_change with an instruction', () => {
    expect(
      validateVariantDecision({ decision: 'request_change', instruction: 'sharpen the opener' }),
    ).toMatchObject({ decision: 'request_change', instruction: 'sharpen the opener' });
  });

  it('rejects an unknown decision', () => {
    expect(validateVariantDecision({ decision: 'publish' })).toBeNull();
  });

  it('rejects a malformed payload', () => {
    expect(validateVariantDecision(null)).toBeNull();
    expect(validateVariantDecision({})).toBeNull();
    expect(validateVariantDecision('approve')).toBeNull();
  });
});
