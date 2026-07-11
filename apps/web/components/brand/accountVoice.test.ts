import { describe, it, expect } from 'vitest';
import {
  lockedAvoidWords,
  isFieldOverridden,
  overrideCount,
  cleanAccountProfile,
  hasFormatOverride,
} from './accountVoice';
import type { VoiceProfile } from './voiceTypes';

const company: VoiceProfile = {
  persona: 'Measured, plain-spoken company voice.',
  tone_attributes: ['calm', 'precise'],
  vocabulary_do: ['balance sheet', 'custody'],
  vocabulary_avoid: ['to the moon', 'HODL'],
  signature_devices: ['opens with a number'],
  format: { register: 'semi-formal', hashtag_use: 'platform-default' },
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
      format: { word_count_max: 25 },
    };
    expect(overrideCount(account, company)).toBe(4);
  });
});

describe('isFieldOverridden for format', () => {
  it('is false when format is absent or empty', () => {
    expect(isFieldOverridden('format', {}, company)).toBe(false);
    expect(isFieldOverridden('format', { format: {} }, company)).toBe(false);
  });

  it('is true when any format field is set', () => {
    expect(isFieldOverridden('format', { format: { word_count_max: 25 } }, company)).toBe(true);
    expect(isFieldOverridden('format', { format: { register: 'conversational' } }, company)).toBe(true);
  });
});

describe('hasFormatOverride', () => {
  it('is false when format is null, undefined, or empty object', () => {
    expect(hasFormatOverride(null)).toBe(false);
    expect(hasFormatOverride(undefined)).toBe(false);
    expect(hasFormatOverride({})).toBe(false);
  });

  it('is true when any field is set', () => {
    expect(hasFormatOverride({ word_count_max: 25 })).toBe(true);
    expect(hasFormatOverride({ register: 'conversational' })).toBe(true);
    expect(hasFormatOverride({ hashtag_use: 'none' })).toBe(true);
    expect(hasFormatOverride({ char_count_max: 200 })).toBe(true);
    expect(hasFormatOverride({ emoji_use: 'none' })).toBe(true);
    expect(hasFormatOverride({ thread_style: 'single-only' })).toBe(true);
  });
});

describe('cleanAccountProfile', () => {
  it('drops empty fields so they fall back to canon', () => {
    const cleaned = cleanAccountProfile(
      { persona: '  ', tone_attributes: [], format: { word_count_max: 25 } },
      company,
    );
    expect(cleaned).toEqual({ format: { word_count_max: 25 } });
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
    expect(cleaned).toEqual({ vocabulary_avoid: ['number go up'] });
  });

  it('omits an avoid list that is only company bans', () => {
    const cleaned = cleanAccountProfile({ vocabulary_avoid: ['HODL'] }, company);
    expect(cleaned).toEqual({});
  });

  it('cleans format: drops undefined fields, omits when all empty', () => {
    const cleaned = cleanAccountProfile({ format: {} }, company);
    expect(cleaned.format).toBeUndefined();
  });

  it('keeps only set format fields', () => {
    const cleaned = cleanAccountProfile(
      { format: { word_count_min: 10, word_count_max: 25, register: 'conversational' } },
      company,
    );
    expect(cleaned.format).toEqual({ word_count_min: 10, word_count_max: 25, register: 'conversational' });
  });

  it('carries the char-count, emoji, and thread-style fields through cleaning', () => {
    const cleaned = cleanAccountProfile(
      { format: { char_count_min: 100, char_count_max: 200, emoji_use: 'none', thread_style: 'single-only' } },
      company,
    );
    expect(cleaned.format).toEqual({
      char_count_min: 100,
      char_count_max: 200,
      emoji_use: 'none',
      thread_style: 'single-only',
    });
  });
});
