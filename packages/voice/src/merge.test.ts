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
});
