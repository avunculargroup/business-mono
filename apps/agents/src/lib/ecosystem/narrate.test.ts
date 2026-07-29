import { describe, it, expect } from 'vitest';
import { lintNarration } from './narrate.js';

const releasePayload = {
  old_version: '6.3.3',
  new_version: '6.3.4',
  published_at: '2026-07-12T02:00:00Z',
  url: 'https://github.com/Coldcard/firmware/releases/tag/v6.3.4',
};

const stalenessPayload = {
  metric: 'attestation',
  last_event_at: '2025-06-06',
  days_since: 401,
  expected_cadence_days: 90,
  days_overdue: 311,
};

describe('lintNarration', () => {
  it('passes a neutral sentence built from the payload', () => {
    expect(lintNarration('Coldcard released firmware 6.3.4 on 12 July 2026.', releasePayload)).toEqual([]);
  });

  it('passes the staleness phrasing the spec calls for', () => {
    expect(
      lintNarration(
        'Proof-of-reserves last attested 401 days ago, against an expected 90-day cadence.',
        stalenessPayload,
      ),
    ).toEqual([]);
  });

  // The whole point of the contract: this is the sentence that turns a fact
  // into product advice from an authorised representative.
  it('rejects a recommendation to act', () => {
    const violations = lintNarration(
      'Coldcard released firmware 6.3.4 — you should update immediately.',
      releasePayload,
    );

    expect(violations.some((v) => v.rule === 'forbidden_word')).toBe(true);
  });

  it.each([
    ['an importance judgment', 'Coldcard released an important firmware fix.'],
    ['a solvency verdict', 'This custodian may be insolvent.'],
    ['a safety claim', 'The 6.3.4 release makes the device safe again.'],
    ['a legality claim', 'The exchange is operating illegally.'],
    ['valence', 'Good news: firmware 6.3.4 is out.'],
  ])('rejects %s', (_label, sentence) => {
    expect(lintNarration(sentence, releasePayload).some((v) => v.rule === 'forbidden_word')).toBe(true);
  });

  // The provenance check: a model that rounds "401 days" to "over 2 years" has
  // introduced a fact nobody verified.
  it('rejects a number the payload does not contain', () => {
    const violations = lintNarration(
      'Proof-of-reserves last attested 500 days ago.',
      stalenessPayload,
    );

    expect(violations).toContainEqual({
      rule: 'unsupported_number',
      detail: '"500" does not appear in the payload.',
    });
  });

  it('accepts digits that appear inside payload strings', () => {
    // "12" and "2026" come out of the published_at string, not thin air.
    expect(lintNarration('Firmware 6.3.4 was published on 12 July 2026.', releasePayload)).toEqual([]);
  });

  it('treats a leading-zero rendering as the same number', () => {
    expect(lintNarration('Attested 06 June, 401 days ago.', { ...stalenessPayload, month: 6 })).toEqual([]);
  });

  it('rejects an exclamation mark', () => {
    expect(
      lintNarration('Coldcard released firmware 6.3.4!', releasePayload).some(
        (v) => v.rule === 'exclamation',
      ),
    ).toBe(true);
  });

  it('rejects an empty narration', () => {
    expect(lintNarration('   ', releasePayload)).toEqual([{ rule: 'empty', detail: 'Narration is empty.' }]);
  });

  it('rejects a runaway paragraph', () => {
    const long = `Coldcard released firmware 6.3.4. ${'It contains changes. '.repeat(20)}`;

    expect(lintNarration(long, releasePayload).some((v) => v.rule === 'too_long')).toBe(true);
  });

  it('does not trip on a forbidden word appearing inside another word', () => {
    // "released" contains "release"; "avoidance" must not fire "avoid" as a
    // substring, and "Safeguard" must not fire "safe".
    expect(
      lintNarration('Coldcard released firmware 6.3.4 for the Safeguard line.', releasePayload).filter(
        (v) => v.rule === 'forbidden_word',
      ),
    ).toEqual([]);
  });
});
