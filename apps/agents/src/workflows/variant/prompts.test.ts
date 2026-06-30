import { describe, it, expect } from 'vitest';
import {
  charCountOf,
  isThreadVariant,
  variantCopyText,
  buildCharliePrompt,
  buildLexPrompt,
  platformFormatRules,
} from './prompts.js';
import type { VariantContext, CharlieVariant } from './schemas.js';

function makeCtx(overrides: Partial<VariantContext> = {}): VariantContext {
  return {
    input: {
      campaignId: '00000000-0000-0000-0000-000000000001',
      beatId: '00000000-0000-0000-0000-000000000002',
      socialAccountId: '00000000-0000-0000-0000-000000000003',
    },
    platform: 'linkedin',
    accountDisplayName: 'BTS — Company (LinkedIn)',
    voiceBlock: '**Persona:** plain, confident advisor',
    platformSpec: { platform: 'linkedin', max_chars: 3000, max_thread_segments: null, max_images_per_post: 9 },
    strategy: {
      tone_guidance: 'Credible, calm, never speculative.',
      key_messages: ['Volatility is not risk on a multi-year horizon'],
      do_not_say: ['price predictions', 'guaranteed returns'],
      hooks: ['Open with a balance-sheet number'],
      hashtags: ['#corporatetreasury'],
    },
    beat: {
      id: '00000000-0000-0000-0000-000000000002',
      core_message: 'A treasury horizon changes how volatility should be read.',
      title: 'Volatility vs risk',
      rationale: 'Reframes the first objection finance leaders raise.',
      prefer_thread: false,
    },
    disclaimerSnippets: [
      { id: 'snip-1', key: 'general_advice_warning' },
      { id: 'snip-2', key: 'no_personal_advice' },
    ],
    ...overrides,
  };
}

const singlePost: CharlieVariant = {
  is_thread: false,
  title: 'Volatility vs risk',
  body: 'A multi-year treasury horizon changes how a finance lead should read bitcoin volatility.',
  segments: [],
  charlie_note: '',
};

const thread: CharlieVariant = {
  is_thread: true,
  title: 'Volatility vs risk',
  body: 'A short thread on horizon and volatility.',
  segments: [{ body: 'First, define the horizon.' }, { body: 'Then read volatility against it.' }],
  charlie_note: '',
};

describe('charCountOf', () => {
  it('counts codepoints, not UTF-16 units', () => {
    expect(charCountOf('abc')).toBe(3);
    // A single emoji is one codepoint but two UTF-16 units.
    expect(charCountOf('🚀')).toBe(1);
  });
});

describe('isThreadVariant', () => {
  it('is true only when flagged a thread AND segments exist', () => {
    expect(isThreadVariant(thread)).toBe(true);
    expect(isThreadVariant(singlePost)).toBe(false);
    expect(isThreadVariant({ ...thread, segments: [] })).toBe(false);
    expect(isThreadVariant({ ...singlePost, is_thread: true })).toBe(false);
  });
});

describe('variantCopyText', () => {
  it('returns the body for a single post', () => {
    expect(variantCopyText(singlePost)).toBe(singlePost.body);
  });
  it('numbers and joins segments for a thread', () => {
    expect(variantCopyText(thread)).toBe(
      '1/ First, define the horizon.\n\n2/ Then read volatility against it.',
    );
  });
});

describe('buildCharliePrompt', () => {
  it('asks for a single LinkedIn post with the char limit and strategy fields', () => {
    const prompt = buildCharliePrompt(makeCtx());
    expect(prompt).toContain('SINGLE LinkedIn post');
    expect(prompt).toContain('3000 characters');
    expect(prompt).toContain('A treasury horizon changes how volatility should be read.');
    expect(prompt).toContain('Do NOT say: price predictions; guaranteed returns');
    expect(prompt).toContain('plain, confident advisor'); // voice block injected
    expect(prompt).toContain('No exclamation marks');
  });

  it('asks for an X thread only on twitter_x when the beat prefers one', () => {
    const ctx = makeCtx({
      platform: 'twitter_x',
      platformSpec: { platform: 'twitter_x', max_chars: 280, max_thread_segments: 25, premium_max_chars: 25000 },
      beat: { ...makeCtx().beat, prefer_thread: true },
    });
    const prompt = buildCharliePrompt(ctx);
    expect(prompt).toContain('X THREAD');
    expect(prompt).toContain('280 characters');
    expect(prompt).toContain('max 25 segments');
  });

  it('keeps a single post on LinkedIn even when the beat prefers a thread', () => {
    const ctx = makeCtx({ beat: { ...makeCtx().beat, prefer_thread: true } });
    expect(buildCharliePrompt(ctx)).toContain('SINGLE LinkedIn post');
  });

  it('includes the requested change when regenerating', () => {
    const prompt = buildCharliePrompt(makeCtx(), 'Make the opening sharper.');
    expect(prompt).toContain('Requested change');
    expect(prompt).toContain('Make the opening sharper.');
  });

  it('injects LinkedIn formatting rules — hook/fold, short paragraphs, hashtags at end', () => {
    const prompt = buildCharliePrompt(makeCtx());
    expect(prompt).toContain('LinkedIn formatting — follow rigorously');
    expect(prompt).toContain('…more');
    expect(prompt).toContain('Short paragraphs');
    expect(prompt).toContain('1,200–2,500 characters');
    expect(prompt).toContain('hashtags together at the very end');
  });

  it('defers length to format notes when the voice block carries them (account override wins)', () => {
    const ctx = makeCtx({
      voiceBlock: '**Persona:** plain, confident advisor\n\n**Format notes:** 10–25 words',
    });
    const prompt = buildCharliePrompt(ctx);
    expect(prompt).not.toContain('1,200–2,500 characters');
    expect(prompt).toContain('follow the "Format notes" in the Voice section below exactly');
    // The hard ceiling is a real platform limit and must still be stated.
    expect(prompt).toContain('3000-character hard ceiling');
  });

  it('injects X single-post formatting rules — punchy, scannable, sparing hashtags', () => {
    const ctx = makeCtx({
      platform: 'twitter_x',
      platformSpec: { platform: 'twitter_x', max_chars: 280, max_thread_segments: 25, premium_max_chars: 25000 },
    });
    const prompt = buildCharliePrompt(ctx);
    expect(prompt).toContain('X (Twitter) formatting — follow rigorously');
    expect(prompt).toContain('100–250 characters');
    expect(prompt).toContain('At most 1–2 hashtags');
  });

  it('injects X thread formatting rules — segment count and a standalone first segment', () => {
    const ctx = makeCtx({
      platform: 'twitter_x',
      platformSpec: { platform: 'twitter_x', max_chars: 280, max_thread_segments: 25, premium_max_chars: 25000 },
      beat: { ...makeCtx().beat, prefer_thread: true },
    });
    const prompt = buildCharliePrompt(ctx);
    expect(prompt).toContain('5–10 segments');
    expect(prompt).toContain('FIRST segment must hook and stand on its own');
  });
});

describe('platformFormatRules', () => {
  const liSpec = { platform: 'linkedin' as const, max_chars: 3000 };
  const xSpec = { platform: 'twitter_x' as const, max_chars: 280 };

  it('gives LinkedIn the fold-aware hook + paragraph rules with the spec ceiling', () => {
    const rules = platformFormatRules('linkedin', liSpec, false);
    expect(rules).toContain('…more');
    expect(rules).toContain('3000-character hard ceiling');
    expect(rules).toContain('Short paragraphs');
  });

  it('drops the LinkedIn numeric target and defers to format notes when present', () => {
    const rules = platformFormatRules('linkedin', liSpec, false, true);
    expect(rules).not.toContain('1,200–2,500 characters');
    expect(rules).toContain('Format notes');
    expect(rules).toContain('3000-character hard ceiling');
  });

  it('gives X a single-post target distinct from the thread rules', () => {
    const single = platformFormatRules('twitter_x', xSpec, false);
    expect(single).toContain('100–250 characters');
    expect(single).not.toContain('segments');

    const thread = platformFormatRules('twitter_x', xSpec, true);
    expect(thread).toContain('5–10 segments');
    expect(thread).toContain('280 characters');
  });
});

describe('buildLexPrompt', () => {
  it('includes the copy and constrains disclaimer choice to the supplied keys', () => {
    const prompt = buildLexPrompt(singlePost, ['general_advice_warning', 'no_personal_advice']);
    expect(prompt).toContain(singlePost.body);
    expect(prompt).toContain('general_advice_warning, no_personal_advice');
    expect(prompt).toContain('personal_opinion');
  });

  it('numbers thread segments in the reviewed copy', () => {
    const prompt = buildLexPrompt(thread, ['general_advice_warning']);
    expect(prompt).toContain('1/ First, define the horizon.');
  });
});
