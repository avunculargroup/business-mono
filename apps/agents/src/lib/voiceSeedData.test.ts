import { describe, it, expect } from 'vitest';
import { BRAND_VOICE_SEED, VOICE_SNIPPET_SEEDS } from './voiceSeedData.js';

describe('BRAND_VOICE_SEED', () => {
  it('carries the Bitcoin capitalisation rule and a mission summary', () => {
    expect(BRAND_VOICE_SEED.bitcoin_capitalisation_rule).toMatch(/Bitcoin.*network/i);
    expect(BRAND_VOICE_SEED.bitcoin_capitalisation_rule).toMatch(/bitcoin.*unit/i);
    expect(BRAND_VOICE_SEED.mission_summary.length).toBeGreaterThan(0);
    expect(BRAND_VOICE_SEED.version).toBe('1.0');
  });

  it('captures the doc’s three tone pillars', () => {
    for (const pillar of ['authoritative', 'pragmatic', 'warm']) {
      expect(BRAND_VOICE_SEED.profile.tone_attributes).toContain(pillar);
    }
  });

  it('bans the doc’s key prohibited terms via vocabulary_avoid', () => {
    const avoid = (BRAND_VOICE_SEED.profile.vocabulary_avoid ?? []).map((t) => t.toLowerCase());
    for (const banned of ['hodl', 'to the moon', 'guaranteed returns', 'crypto', 'shitcoin']) {
      expect(avoid).toContain(banned);
    }
  });

  it('favours the doc’s required treasury terminology via vocabulary_do', () => {
    const dos = (BRAND_VOICE_SEED.profile.vocabulary_do ?? []).join(' | ').toLowerCase();
    expect(dos).toContain('bitcoin treasury strategy');
    expect(dos).toContain('strategic reserve asset');
  });

  it('encodes the no-exclamation-marks signature device', () => {
    const devices = (BRAND_VOICE_SEED.profile.signature_devices ?? []).join(' ').toLowerCase();
    expect(devices).toContain('no exclamation marks');
  });
});

describe('VOICE_SNIPPET_SEEDS', () => {
  it('every snippet has a non-empty body and curator note (the teaching content)', () => {
    for (const s of VOICE_SNIPPET_SEEDS) {
      expect(s.body.trim().length).toBeGreaterThan(0);
      expect(s.curator_note.trim().length).toBeGreaterThan(0);
    }
  });

  it('includes the calibration sample as a starred full_post', () => {
    const starred = VOICE_SNIPPET_SEEDS.filter((s) => s.is_starred);
    expect(starred.length).toBeGreaterThan(0);
    expect(starred.some((s) => s.snippet_type === 'full_post' && /6,600 years/.test(s.body))).toBe(
      true,
    );
  });
});
