import { describe, it, expect } from 'vitest';
import {
  lockedAvoidWords,
  isFieldOverridden,
  overrideCount,
  cleanAccountProfile,
} from './accountVoice';
import type { VoiceProfile } from './voiceTypes';

const company: VoiceProfile = {
  persona: 'Measured, plain-spoken company voice.',
  tone_attributes: ['calm', 'precise'],
  vocabulary_do: ['balance sheet', 'custody'],
  vocabulary_avoid: ['to the moon', 'HODL'],
  signature_devices: ['opens with a number'],
  format_notes: 'No exclamation marks.',
};

describe('lockedAvoidWords', () => {
  it('returns the company avoid list', () => {
    expect(lockedAvoidWords(company)).toEqual(['to the moon', 'HODL']);
  });

  it('is empty when company has none', () => {
    expect(lockedAvoidWords({})).toEqual([]);
    expect(lockedAvoidWords(null)).toEqual([]);
  });
});

describe('isFieldOverridden', () => {
  it('treats a set string field as overridden', () => {
    expect(isFieldOverridden('persona', { persona: 'Chris on X — punchy.' }, company)).toBe(true);
  });

  it('treats an empty/blank string field as inherited', () => {
    expect(isFieldOverridden('persona', { persona: '   ' }, company)).toBe(false);
    expect(isFieldOverridden('persona', {}, company)).toBe(false);
  });

  it('treats a non-empty array field as overridden', () => {
    expect(isFieldOverridden('tone_attributes', { tone_attributes: ['punchy'] }, company)).toBe(true);
  });

  it('treats an empty array field as inherited', () => {
    expect(isFieldOverridden('tone_attributes', { tone_attributes: [] }, company)).toBe(false);
  });

  it('does not count inherited company bans as a vocabulary_avoid override', () => {
    // Account repeats only the locked company words → not an override.
    expect(isFieldOverridden('vocabulary_avoid', { vocabulary_avoid: ['HODL'] }, company)).toBe(false);
  });

  it('counts the account own additions as a vocabulary_avoid override', () => {
    expect(isFieldOverridden('vocabulary_avoid', { vocabulary_avoid: ['number go up'] }, company)).toBe(true);
  });
});

describe('overrideCount', () => {
  it('is zero when the account inherits everything', () => {
    expect(overrideCount({}, company)).toBe(0);
  });

  it('counts each overridden field once', () => {
    const account: VoiceProfile = {
      persona: 'Chris on X — punchy.',
      tone_attributes: ['punchy', 'direct'],
      vocabulary_avoid: ['number go up'],
    };
    expect(overrideCount(account, company)).toBe(3);
  });
});

describe('cleanAccountProfile', () => {
  it('drops empty fields so they fall back to canon', () => {
    const cleaned = cleanAccountProfile(
      { persona: '  ', tone_attributes: [], format_notes: 'Short.' },
      company,
    );
    expect(cleaned).toEqual({ format_notes: 'Short.' });
  });

  it('trims values and removes blank array entries', () => {
    const cleaned = cleanAccountProfile(
      { persona: '  Chris.  ', tone_attributes: ['punchy', '  ', 'direct'] },
      company,
    );
    expect(cleaned).toEqual({ persona: 'Chris.', tone_attributes: ['punchy', 'direct'] });
  });

  it('strips company-banned words from the stored avoid list', () => {
    const cleaned = cleanAccountProfile(
      { vocabulary_avoid: ['HODL', 'number go up', 'to the moon'] },
      company,
    );
    // Only the account-specific addition survives; locked words are enforced via union.
    expect(cleaned).toEqual({ vocabulary_avoid: ['number go up'] });
  });

  it('omits an avoid list that is only company bans', () => {
    const cleaned = cleanAccountProfile({ vocabulary_avoid: ['HODL'] }, company);
    expect(cleaned).toEqual({});
  });
});
