import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase.js';

const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
vi.mock('@platform/db', () => ({ get supabase() { return fakeSupabase; } }));

const { loadPaywalledDomains, matchesPaywalledDomain, resolvePaywalled, resetPaywalledDomainsCache } =
  await import('./paywalledDomains.js');

function listDomains(...domains: string[]) {
  fakeSupabase.__setResponse('paywalled_domains', { data: domains.map((domain) => ({ domain })), error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeSupabase.__responses.clear();
  resetPaywalledDomainsCache();
  listDomains('bloomberg.com', 'ft.com');
});

describe('matchesPaywalledDomain', () => {
  it.each([
    ['https://www.bloomberg.com/news/articles/x', true],
    ['https://ft.com/content/abc', true],
    ['https://markets.ft.com/data', true],
    ['https://notft.com/story', false],
    ['https://www.theblock.co/post/1', false],
    ['email://message-id', false],
    ['not a url', false],
  ])('%s → %s', (url, expected) => {
    expect(matchesPaywalledDomain(url, ['bloomberg.com', 'ft.com'])).toBe(expected);
  });
});

describe('loadPaywalledDomains', () => {
  it('reads the table once and serves the cache after that', async () => {
    expect(await loadPaywalledDomains()).toEqual(['bloomberg.com', 'ft.com']);
    await loadPaywalledDomains();
    expect(fakeSupabase.__buildersFor('paywalled_domains')).toHaveLength(1);
  });

  it('returns an empty list when the read fails, rather than blocking ingestion', async () => {
    fakeSupabase.__setResponse('paywalled_domains', { data: null, error: { message: 'down' } });
    expect(await loadPaywalledDomains()).toEqual([]);
  });
});

describe('resolvePaywalled', () => {
  it('marks a listed publisher even when its page could not be fetched', async () => {
    expect(await resolvePaywalled({ url: 'https://www.bloomberg.com/news/1', page: null })).toBe(true);
  });

  it('marks paywall wording deep in the body', async () => {
    const body = `${'Navigation. '.repeat(1500)}Subscribe to unlock this article`;
    expect(await resolvePaywalled({ url: 'https://example.com/a', page: false, body })).toBe(true);
  });

  it('keeps the page answer for an unlisted site with no wording', async () => {
    expect(await resolvePaywalled({ url: 'https://www.theblock.co/post/1', page: null, body: 'Free text.' })).toBeNull();
    expect(await resolvePaywalled({ url: 'https://example.com/a', page: false, body: 'Free text.' })).toBe(false);
  });

  it('trusts the page markup when it declares a paywall', async () => {
    expect(await resolvePaywalled({ url: 'https://example.com/a', page: true })).toBe(true);
  });
});
