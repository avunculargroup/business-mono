import { describe, it, expect } from 'vitest';
import { mergeVoice } from './merge.js';
import type { VoiceProfile } from './types.js';

const company: VoiceProfile = {
  persona: 'A competent advisor who speaks plainly.',
  tone_attributes: ['trustworthy', 'calm'],
  vocabulary_do: ['treasury horizon', 'balance sheet'],
  vocabulary_avoid: ['HODL', 'to the moon'],
  signature_devices: ['explain jargon when used'],
  format_notes: 'Plain, confident language.',
};

describe('mergeVoice', () => {
  it('returns the company canon unchanged when there is no account override', () => {
    expect(mergeVoice(company, null)).toEqual(company);
  });

  it('lets the account profile win on overlapping scalar and list fields', () => {
    const account: VoiceProfile = {
      persona: 'A CFO-seat operator.',
      tone_attributes: ['plain-spoken', 'authoritative'],
      format_notes: 'X: punchy, one idea per segment.',
    };
    const merged = mergeVoice(company, account);
    expect(merged.persona).toBe('A CFO-seat operator.');
    expect(merged.tone_attributes).toEqual(['plain-spoken', 'authoritative']);
    expect(merged.format_notes).toBe('X: punchy, one idea per segment.');
  });

  it('fills gaps from the company canon when the account omits a field', () => {
    const account: VoiceProfile = { persona: 'A CFO-seat operator.' };
    const merged = mergeVoice(company, account);
    // Not overridden → inherited from company.
    expect(merged.tone_attributes).toEqual(['trustworthy', 'calm']);
    expect(merged.vocabulary_do).toEqual(['treasury horizon', 'balance sheet']);
    expect(merged.signature_devices).toEqual(['explain jargon when used']);
  });

  it('unions vocabulary_avoid rather than overriding it', () => {
    const account: VoiceProfile = { vocabulary_avoid: ['diamond hands', 'HODL'] };
    const merged = mergeVoice(company, account);
    // Company bans survive; account additions appended; case-insensitive dedupe.
    expect(merged.vocabulary_avoid).toEqual(['HODL', 'to the moon', 'diamond hands']);
  });

  it('treats empty strings and empty arrays as unset (no clobbering the canon)', () => {
    const account: VoiceProfile = {
      persona: '   ',
      tone_attributes: [],
      vocabulary_do: [],
    };
    const merged = mergeVoice(company, account);
    expect(merged.persona).toBe(company.persona);
    expect(merged.tone_attributes).toEqual(company.tone_attributes);
    expect(merged.vocabulary_do).toEqual(company.vocabulary_do);
  });

  it('handles a null company canon by returning the account profile', () => {
    const account: VoiceProfile = { persona: 'Solo voice.', vocabulary_avoid: ['hype'] };
    expect(mergeVoice(null, account)).toEqual(account);
  });

  it('merges FormatConfig field-by-field (account wins per field)', () => {
    const base: VoiceProfile = {
      ...company,
      format: { word_count_min: 100, word_count_max: 300, register: 'semi-formal' },
    };
    const account: VoiceProfile = { format: { word_count_max: 25, register: 'conversational' } };
    const merged = mergeVoice(base, account);
    // Account wins on word_count_max and register.
    expect(merged.format?.word_count_max).toBe(25);
    expect(merged.format?.register).toBe('conversational');
    // Company fills the gap for word_count_min (account didn't set it).
    expect(merged.format?.word_count_min).toBe(100);
  });

  it('fills all FormatConfig fields from company when account has no format', () => {
    const base: VoiceProfile = {
      ...company,
      format: { word_count_max: 300, hashtag_use: 'none' },
    };
    const account: VoiceProfile = { persona: 'Chris on X.' };
    const merged = mergeVoice(base, account);
    expect(merged.format?.word_count_max).toBe(300);
    expect(merged.format?.hashtag_use).toBe('none');
  });

  it('account format overrides company format completely when all fields set', () => {
    const base: VoiceProfile = {
      ...company,
      format: { word_count_min: 100, word_count_max: 300, register: 'formal' },
    };
    const account: VoiceProfile = {
      format: {
        word_count_min: 10,
        word_count_max: 25,
        register: 'conversational',
        paragraphing: 'single-block',
        hashtag_use: 'none',
      },
    };
    const merged = mergeVoice(base, account);
    expect(merged.format).toEqual(account.format);
  });

  it('omits format from merged profile when neither side sets it', () => {
    const merged = mergeVoice(company, { persona: 'Solo voice.' });
    expect(merged.format).toBeUndefined();
  });
});
