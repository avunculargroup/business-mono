import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResolvedVoiceContext } from '@platform/voice';

const { resolveVoiceContext } = vi.hoisted(() => ({ resolveVoiceContext: vi.fn() }));
vi.mock('@platform/voice', () => ({ resolveVoiceContext }));

const { formatResolvedVoice, resolveCompanyVoiceBlock, voiceBlockHasFormatNotes } = await import(
  './voicePrompt.js'
);

const canon: ResolvedVoiceContext = {
  profile: {
    persona: 'A plain-spoken advisor.',
    tone_attributes: ['calm', 'authoritative'],
    vocabulary_do: ['treasury horizon'],
    vocabulary_avoid: ['HODL', 'to the moon'],
    signature_devices: ['no exclamation marks'],
    format_notes: 'Semi-formal.',
  },
  bitcoinCapitalisationRule: 'Bitcoin = network; bitcoin = unit.',
  missionSummary: 'We make Bitcoin work for businesses.',
  snippets: [],
};

beforeEach(() => resolveVoiceContext.mockReset());

describe('formatResolvedVoice', () => {
  it('renders persona, tone, vocab, the Bitcoin rule, and mission', () => {
    const block = formatResolvedVoice(canon);
    expect(block).toContain('A plain-spoken advisor.');
    expect(block).toContain('calm, authoritative');
    expect(block).toContain('HODL, to the moon');
    expect(block).toContain('Bitcoin = network');
    expect(block).toContain('We make Bitcoin work for businesses.');
  });

  it('renders exemplars with their curator note when snippets are present', () => {
    const block = formatResolvedVoice({
      ...canon,
      snippets: [
        {
          id: '1',
          social_account_id: null,
          snippet_type: 'opener',
          body: 'Open with a number.',
          curator_note: 'earns attention first',
          platform: 'twitter_x',
          topic_tags: ['volatility'],
          is_starred: true,
          similarity: 0.9,
          score: 0.95,
        },
      ],
    });
    expect(block).toContain('Open with a number.');
    expect(block).toContain('earns attention first');
  });
});

describe('voiceBlockHasFormatNotes', () => {
  it('detects a rendered format-notes line so length defaults can defer to it', () => {
    const block = formatResolvedVoice({ ...canon, profile: { ...canon.profile, format_notes: '10–25 words' } });
    expect(voiceBlockHasFormatNotes(block)).toBe(true);
  });

  it('is false when the profile carries no format notes', () => {
    const block = formatResolvedVoice({ ...canon, profile: { ...canon.profile, format_notes: undefined } });
    expect(voiceBlockHasFormatNotes(block)).toBe(false);
  });
});

describe('resolveCompanyVoiceBlock', () => {
  it('returns a formatted block when the canon is seeded', async () => {
    resolveVoiceContext.mockResolvedValue(canon);
    const block = await resolveCompanyVoiceBlock();
    expect(block).toContain('A plain-spoken advisor.');
  });

  it('returns null when the canon has no persona (table unseeded) so callers fall back', async () => {
    resolveVoiceContext.mockResolvedValue({ ...canon, profile: {} });
    expect(await resolveCompanyVoiceBlock()).toBeNull();
  });

  it('returns null rather than throwing into the agent hot path when resolution misbehaves', async () => {
    // A malformed context (no profile) makes the body throw; the catch must
    // swallow it and fall back, so a transient resolution fault never breaks
    // a content generation.
    resolveVoiceContext.mockResolvedValue(undefined);
    expect(await resolveCompanyVoiceBlock()).toBeNull();
  });
});
