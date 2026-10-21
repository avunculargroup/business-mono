import { describe, it, expect } from 'vitest';
import { checkProfile, mayStateProfile, pickProfileFacts, profilePrompt, type ProfileFact } from './profileFacts.js';

const UNIT = {
  documentId: 'doc-1',
  sectionId: 'sec-1',
  text: 'Verrall develops payroll software for small businesses. As at 30 June 2026 we had 1,240 full-time employees.',
};

const candidate = (overrides: Partial<Omit<ProfileFact, 'natural_key'>> = {}): Omit<ProfileFact, 'natural_key'> => ({
  field_key: 'headcount',
  label: 'Employees',
  value: '1,240',
  as_of: '2026-06-30',
  source_document_id: 'doc-1',
  source_section_id: null,
  ...overrides,
});

describe('mayStateProfile', () => {
  it('lets through text that could say what the company does or who it employs', () => {
    expect(mayStateProfile(UNIT.text)).toBe(true);
    expect(mayStateProfile('Principal activities: the operation of food markets.')).toBe(true);
  });

  it('skips a purchase notice, which states neither', () => {
    expect(mayStateProfile('The Company has acquired 6.08914 bitcoin for A$1,000,000.')).toBe(false);
  });
});

describe('checkProfile', () => {
  it('keeps a stated headcount and a plain description, citing the unit read', () => {
    const { facts, dropped } = checkProfile(
      {
        business_description: { value: 'Develops payroll software for small businesses.', as_of: '2026-06-30' },
        headcount: { value: 1240, as_of: '2026-06-30' },
      },
      UNIT,
      [],
    );
    expect(dropped).toEqual([]);
    expect(facts).toEqual([
      {
        field_key: 'business_description',
        label: 'Business',
        value: 'Develops payroll software for small businesses.',
        as_of: '2026-06-30',
        source_document_id: 'doc-1',
        source_section_id: 'sec-1',
      },
      {
        field_key: 'headcount',
        label: 'Employees',
        value: '1,240',
        as_of: '2026-06-30',
        source_document_id: 'doc-1',
        source_section_id: 'sec-1',
      },
    ]);
  });

  it('drops a headcount the text does not state', () => {
    const { facts, dropped } = checkProfile(
      { business_description: null, headcount: { value: 1300, as_of: null } },
      UNIT,
      [],
    );
    expect(facts).toEqual([]);
    expect(dropped).toEqual([{ field: 'headcount', reason: 'figure not present in source' }]);
  });

  it('drops a headcount that is not a whole number of people', () => {
    const { dropped } = checkProfile({ business_description: null, headcount: { value: 0, as_of: null } }, UNIT, []);
    expect(dropped).toEqual([{ field: 'headcount', reason: 'not a whole number of people' }]);
  });

  it('drops a description the summary filter would refuse, restricted metrics included', () => {
    expect(
      checkProfile(
        { business_description: { value: 'The leading payroll provider.', as_of: null }, headcount: null },
        UNIT,
        [],
      ).dropped,
    ).toEqual([{ field: 'business_description', reason: 'uses leading' }]);
    expect(
      checkProfile(
        { business_description: { value: 'Reports its mNAV quarterly.', as_of: null }, headcount: null },
        UNIT,
        ['mNAV'],
      ).dropped,
    ).toEqual([{ field: 'business_description', reason: 'uses mNAV' }]);
  });

  it('stores an as_of it cannot read as a date as null', () => {
    const { facts } = checkProfile(
      { business_description: { value: 'Develops payroll software.', as_of: 'June 2026' }, headcount: null },
      UNIT,
      [],
    );
    expect(facts[0].as_of).toBeNull();
  });
});

describe('pickProfileFacts', () => {
  it('keeps one fact per field, the latest dated, keyed from the record', () => {
    const picked = pickProfileFacts('verrall', [
      candidate({ value: '1,100', as_of: '2025-06-30', source_document_id: 'doc-old' }),
      candidate(),
      candidate({ value: '1,180', as_of: null, source_document_id: 'doc-undated' }),
      candidate({ field_key: 'business_description', label: 'Business', value: 'Payroll software.' }),
    ]);
    expect(picked.map((fact) => [fact.field_key, fact.value, fact.natural_key])).toEqual([
      ['business_description', 'Payroll software.', 'verrall:fact:business_description'],
      ['headcount', '1,240', 'verrall:fact:headcount'],
    ]);
  });

  it('breaks a tie on the source, whatever order the documents were read in', () => {
    const a = candidate({ value: 'first', source_document_id: 'doc-a' });
    const b = candidate({ value: 'second', source_document_id: 'doc-b' });
    expect(pickProfileFacts('verrall', [a, b])[0].value).toBe('first');
    expect(pickProfileFacts('verrall', [b, a])[0].value).toBe('first');
  });
});

describe('profilePrompt', () => {
  it('carries the unit, and asks for headcount verbatim and nothing about value', () => {
    const prompt = profilePrompt({ ...UNIT, title: 'Form 10-K', filingItem: '10-K Item 1', sourceClass: 'filed_narrative' });
    expect(prompt).toContain('Filing item: 10-K Item 1');
    expect(prompt).toContain('EXACTLY as written');
    expect(prompt).toContain('Nothing about bitcoin holdings, share price, value, revenue, profit or performance.');
    expect(prompt).toContain(UNIT.text);
  });
});
