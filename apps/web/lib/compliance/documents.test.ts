import { describe, expect, it } from 'vitest';
import {
  PROFILE_FIELDS,
  blankProfileFields,
  documentReadiness,
  profileFieldsUsedBy,
  type ProfileValues,
} from './documents';

const FULL: ProfileValues = Object.fromEntries(
  PROFILE_FIELDS.map((field) => [field, 'value']),
) as ProfileValues;

const BODY = 'ABN {{bts_abn}}, {{bts_legal_name}}. Privacy: {{bts_privacy_policy_url}}. v{{statement_version}} {{statement_date}}';

function doc(overrides: Partial<Parameters<typeof documentReadiness>[0]> = {}) {
  return { body: BODY, version: '1.0', effectiveFrom: null, ...overrides };
}

describe('documentReadiness', () => {
  it('is ready when the profile is filled', () => {
    const result = documentReadiness(doc(), FULL, '2026-09-12');

    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.body).not.toContain('{{');
  });

  it('names an unset privacy URL like any other blank profile field', () => {
    // It was read from NEXT_PUBLIC_PRIVACY_POLICY_URL until 20260916010000, so
    // a complete profile could still block the gate with nothing on the form to
    // say why. It is a column now, and this is the case that says so.
    const result = documentReadiness(doc(), { ...FULL, privacy_policy_url: null }, '2026-09-12');

    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(['bts_privacy_policy_url']);
  });

  it('treats an empty-string privacy URL as unset', () => {
    // A cleared input posts '' rather than null, so '' is a shape the column
    // actually holds.
    const result = documentReadiness(doc(), { ...FULL, privacy_policy_url: '' }, '2026-09-12');

    expect(result.missing).toEqual(['bts_privacy_policy_url']);
  });

  it('returns no body at all when anything is missing', () => {
    // Never half-substituted. A body with "ABN {{bts_abn}}" in it looks
    // finished and is not.
    const result = documentReadiness(doc(), null, '2026-09-12');

    expect(result.body).toBe('');
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it('names every missing key, sorted, rather than stopping at the first', () => {
    const result = documentReadiness(
      doc(),
      { ...FULL, abn: null, legal_name: '  ' },
      '2026-09-12',
    );

    expect(result.missing).toEqual(['bts_abn', 'bts_legal_name']);
  });

  it('dates the document from effective_from when it has one', () => {
    const result = documentReadiness(doc({ effectiveFrom: '2026-01-01' }), FULL, '2026-09-12');

    expect(result.body).toContain('2026-01-01');
    expect(result.body).not.toContain('2026-09-12');
  });

  it('falls back to today when it has no effective date yet', () => {
    const result = documentReadiness(doc(), FULL, '2026-09-12');

    expect(result.body).toContain('2026-09-12');
  });
});

describe('profileFieldsUsedBy', () => {
  it('lists only the fields the body actually references', () => {
    // Telling someone the terms of service are blocked on a complaints phone
    // number the document never mentions would be a lie.
    expect(profileFieldsUsedBy('{{bts_abn}} {{bts_legal_name}}')).toEqual([
      'legal_name',
      'abn',
    ]);
  });

  it('handles the complaints keys, which carry no bts_ prefix', () => {
    expect(profileFieldsUsedBy('{{complaints_email}}')).toEqual(['complaints_email']);
  });

  it('returns nothing for a body with no placeholders', () => {
    expect(profileFieldsUsedBy('Plain text.')).toEqual([]);
  });

  it('ignores placeholders that are not profile fields', () => {
    expect(profileFieldsUsedBy('{{statement_version}} {{statement_date}}')).toEqual([]);
  });

  it('lists the privacy policy URL, which is a profile field as of 20260916010000', () => {
    expect(profileFieldsUsedBy('{{bts_privacy_policy_url}}')).toEqual(['privacy_policy_url']);
  });
});

describe('blankProfileFields', () => {
  it('finds nothing in a filled profile', () => {
    expect(blankProfileFields(FULL)).toEqual([]);
  });

  it('counts whitespace as blank, as the resolver does', () => {
    expect(blankProfileFields({ ...FULL, abn: '   ' })).toEqual(['abn']);
  });

  it('counts null and absent alike', () => {
    expect(blankProfileFields({ ...FULL, acn: null })).toEqual(['acn']);
  });

  it('treats a missing profile as every field blank', () => {
    expect(blankProfileFields(null)).toEqual([...PROFILE_FIELDS]);
  });

  it('narrows to the fields asked for', () => {
    expect(blankProfileFields({ ...FULL, abn: null }, ['legal_name'])).toEqual([]);
  });
});
