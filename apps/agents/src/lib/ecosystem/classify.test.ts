import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateMock = vi.fn();
vi.mock('../../agents/compliance/index.js', () => ({
  lex: { generate: generateMock },
}));
vi.mock('../../config/model.js', () => ({
  stepRequestContext: vi.fn(() => ({})),
  dynamicModelFor: vi.fn(() => 'mock-model'),
}));

const { classifyChange, applyFloor } = await import('./classify.js');

const regulatoryChange = {
  changeType: 'regulatory_change',
  title: 'No longer listed on the AUSTRAC DCE register',
  payload: { register: 'austrac_dce', old_status: 'registered', new_status: 'not_found' },
  entityName: 'Exchange Y',
};

const releaseChange = {
  changeType: 'release',
  title: 'firmware v6.3.4',
  payload: { new_version: '6.3.4' },
  entityName: 'Coldcard',
};

beforeEach(() => {
  generateMock.mockReset();
});

describe('applyFloor', () => {
  // A de-listing reported as fact is fine; the same de-listing editorialised
  // into a solvency judgment is not. So it never reaches a client screen
  // without a human, whatever the model thought.
  it('holds a regulatory change at solvency_adjacent even when the model says neutral', () => {
    expect(applyFloor('regulatory_change', 'neutral')).toBe('solvency_adjacent');
    expect(applyFloor('regulatory_change', 'valuation_adjacent')).toBe('solvency_adjacent');
    expect(applyFloor('regulatory_change', 'advice_adjacent')).toBe('solvency_adjacent');
  });

  it('lets the model escalate above the floor but never below it', () => {
    expect(applyFloor('regulatory_change', 'solvency_adjacent')).toBe('solvency_adjacent');
  });

  it('leaves change types with no floor to the model', () => {
    expect(applyFloor('release', 'neutral')).toBe('neutral');
    expect(applyFloor('policy_change', 'valuation_adjacent')).toBe('valuation_adjacent');
  });
});

describe('classifyChange', () => {
  it('returns the model classification for an ordinary change', async () => {
    generateMock.mockResolvedValue({
      object: { compliance_class: 'neutral', compliance_notes: 'Plain product fact.' },
    });

    const result = await classifyChange(releaseChange);

    expect(result).toEqual({ complianceClass: 'neutral', complianceNotes: 'Plain product fact.' });
  });

  it('applies the floor to what the model returned', async () => {
    generateMock.mockResolvedValue({
      object: { compliance_class: 'neutral', compliance_notes: 'Just a register entry.' },
    });

    const result = await classifyChange(regulatoryChange);

    expect(result?.complianceClass).toBe('solvency_adjacent');
  });

  // Fail closed. NULL is refused by the promotion gate exactly like a
  // compliance-sensitive class, so a failed call cannot read as a clearance.
  it('returns null when the model call throws', async () => {
    generateMock.mockRejectedValue(new Error('model unavailable'));

    expect(await classifyChange(releaseChange)).toBeNull();
  });

  it('returns null when the model returns an unparseable object', async () => {
    generateMock.mockResolvedValue({ object: { compliance_class: 'probably fine' } });

    expect(await classifyChange(releaseChange)).toBeNull();
  });

  it('returns null when the model returns nothing at all', async () => {
    generateMock.mockResolvedValue({ object: undefined });

    expect(await classifyChange(releaseChange)).toBeNull();
  });
});
