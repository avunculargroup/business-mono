import { describe, it, expect } from 'vitest';
import { factsAsOf, needsDraft, summaryPrompt, summaryViolations, type SummaryFact } from './summaryDraft.js';

const fact = (overrides: Partial<SummaryFact> = {}): SummaryFact => ({
  field_key: 'custody',
  label: 'Custody',
  value: 'Held with a third-party qualified custodian.',
  as_of: '2026-06-30',
  updated_at: '2026-09-01T00:00:00Z',
  ...overrides,
});

describe('summaryViolations', () => {
  it('passes a summary that states how the holding is implemented', () => {
    expect(
      summaryViolations(
        'Holds bitcoin under a board-approved treasury policy, with a third-party custodian. It accounts for the holding at fair value and discloses purchases by exchange announcement.',
        ['mNAV', 'BTC Yield'],
      ),
    ).toEqual([]);
  });

  it('finds advice words as whole words only', () => {
    expect(summaryViolations('Investors should note the policy.', [])).toEqual(['should']);
    // "Coinbase" is not "coin", "knowledge" is not "edge".
    expect(summaryViolations('Custody is with Coinbase, to its knowledge.', [])).toEqual([]);
  });

  it('finds restricted metrics passed in from the table, in any case', () => {
    expect(summaryViolations('It reports a btc yield each quarter.', ['BTC Yield'])).toEqual(['BTC Yield']);
    expect(summaryViolations('Trades at an mNAV of 1.2.', ['mNAV'])).toEqual(['mNAV']);
  });

  it('finds outcome phrases and exclamation marks', () => {
    expect(summaryViolations('It holds an unrealised gain!', [])).toEqual(['unrealised gain', '!']);
  });
});

describe('needsDraft', () => {
  it('never drafts over a summary a person has written', () => {
    expect(needsDraft({ clientSummary: 'Written.', facts: [fact()], existing: null })).toBe(false);
  });

  it('does not draft from nothing', () => {
    expect(needsDraft({ clientSummary: null, facts: [], existing: null })).toBe(false);
  });

  it('drafts when there is no draft yet', () => {
    expect(needsDraft({ clientSummary: '  ', facts: [fact()], existing: null })).toBe(true);
  });

  it('keeps a draft that is current with the facts, and redrafts once a fact moves', () => {
    const existing = { facts_as_of: '2026-09-01T00:00:00Z' };
    expect(needsDraft({ clientSummary: null, facts: [fact()], existing })).toBe(false);
    expect(
      needsDraft({
        clientSummary: null,
        facts: [fact(), fact({ field_key: 'mandate', updated_at: '2026-10-02T00:00:00Z' })],
        existing,
      }),
    ).toBe(true);
  });
});

describe('factsAsOf', () => {
  it('is the newest fact edit', () => {
    expect(
      factsAsOf([fact(), fact({ updated_at: '2026-10-02T00:00:00Z' }), fact({ updated_at: '2026-01-01T00:00:00Z' })]),
    ).toBe('2026-10-02T00:00:00Z');
  });
});

describe('summaryPrompt', () => {
  it('carries every fact with its key, and names the terms a refused draft used', () => {
    const prompt = summaryPrompt({
      legalName: 'Verrall Holdings',
      facts: [fact(), fact({ field_key: 'mandate', label: 'Mandate', value: 'Board resolution', as_of: null })],
      rejected: ['should'],
    });
    expect(prompt).toContain('Company: Verrall Holdings');
    expect(prompt).toContain('- Custody (custody, as of 2026-06-30): Held with a third-party qualified custodian.');
    expect(prompt).toContain('- Mandate (mandate): Board resolution');
    expect(prompt).toContain('refused because it used: "should"');
  });
});
