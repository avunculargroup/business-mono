import { describe, it, expect, vi } from 'vitest';
import { resolveVoiceContext } from './resolve.js';
import type { VoiceResolverDeps, BrandVoice, SocialAccountVoice, VoiceSnippet } from './types.js';

const brand: BrandVoice = {
  profile: {
    persona: 'A competent advisor who speaks plainly.',
    tone_attributes: ['trustworthy', 'calm'],
    vocabulary_avoid: ['HODL'],
  },
  mission_summary: 'BTS sounds like a private wealth manager with the polish of Stripe.',
  bitcoin_capitalisation_rule: 'Bitcoin = network/protocol, bitcoin = the currency/unit.',
  content_policy: {
    topics_endorsed: ['treasury strategy'],
    topics_avoided: ['price predictions'],
  },
  version: '1.0',
};

const account: SocialAccountVoice = {
  id: 'acc-1',
  platform: 'twitter_x',
  voice_profile: {
    persona: 'A CFO-seat operator.',
    vocabulary_avoid: ['diamond hands'],
  },
};

const snippet: VoiceSnippet = {
  id: 'snip-1',
  social_account_id: null,
  snippet_type: 'opener',
  body: 'Treasury risk is not volatility on a multi-year horizon.',
  curator_note: 'Opens with the reframe finance leaders respond to.',
  platform: 'twitter_x',
  topic_tags: ['volatility'],
  is_starred: true,
  similarity: 0.82,
  score: 0.87,
};

function makeDeps(over: Partial<VoiceResolverDeps> = {}): VoiceResolverDeps {
  return {
    loadActiveBrandVoice: vi.fn().mockResolvedValue(brand),
    loadAccount: vi.fn().mockResolvedValue(account),
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    retrieve: vi.fn().mockResolvedValue([snippet]),
    ...over,
  };
}

describe('resolveVoiceContext', () => {
  it('merges canon + account and returns the always-on Bitcoin rule and mission', async () => {
    const ctx = await resolveVoiceContext({ accountId: 'acc-1', query: 'volatility reframe' }, makeDeps());
    expect(ctx.profile.persona).toBe('A CFO-seat operator.'); // account wins
    expect(ctx.profile.tone_attributes).toEqual(['trustworthy', 'calm']); // canon fills gap
    expect(ctx.profile.vocabulary_avoid).toEqual(['HODL', 'diamond hands']); // unioned
    expect(ctx.bitcoinCapitalisationRule).toBe(brand.bitcoin_capitalisation_rule);
    expect(ctx.missionSummary).toBe(brand.mission_summary);
    expect(ctx.contentPolicy).toEqual(brand.content_policy); // canon-only, always surfaced
    expect(ctx.snippets).toEqual([snippet]);
  });

  it('derives the platform from the account and scopes retrieval to it', async () => {
    const deps = makeDeps();
    await resolveVoiceContext({ accountId: 'acc-1', query: 'reframe' }, deps);
    expect(deps.embed).toHaveBeenCalledWith('reframe');
    expect(deps.retrieve).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acc-1', platform: 'twitter_x', queryEmbedding: [0.1, 0.2, 0.3] }),
    );
  });

  it('skips retrieval entirely when no query is given (merge-only)', async () => {
    const deps = makeDeps();
    const ctx = await resolveVoiceContext({ accountId: 'acc-1' }, deps);
    expect(deps.embed).not.toHaveBeenCalled();
    expect(deps.retrieve).not.toHaveBeenCalled();
    expect(ctx.snippets).toEqual([]);
  });

  it('resolves company-canon-only voice for non-account content', async () => {
    const deps = makeDeps({ loadAccount: vi.fn() });
    const ctx = await resolveVoiceContext({ query: 'newsletter angle' }, deps);
    expect(deps.loadAccount).not.toHaveBeenCalled();
    expect(ctx.profile.persona).toBe(brand.profile.persona); // canon only
    expect(deps.retrieve).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: null, platform: null }),
    );
  });

  it('throws when the named account does not exist', async () => {
    const deps = makeDeps({ loadAccount: vi.fn().mockResolvedValue(null) });
    await expect(resolveVoiceContext({ accountId: 'missing' }, deps)).rejects.toThrow(/not found/);
  });
});
