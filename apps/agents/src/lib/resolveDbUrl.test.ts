import { describe, it, expect, beforeEach, vi } from 'vitest';

// resolveDbUrl caches its result at module scope. Tests need a fresh module
// per assertion so previous env values don't carry over.
async function loadFresh() {
  vi.resetModules();
  return await import('./resolveDbUrl.js');
}

describe('getResolvedMastraDbUrl', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws when neither MASTRA_DB_URL nor SUPABASE_DB_URL is set', async () => {
    vi.stubEnv('MASTRA_DB_URL', '');
    vi.stubEnv('SUPABASE_DB_URL', '');
    const { getResolvedMastraDbUrl } = await loadFresh();
    expect(() => getResolvedMastraDbUrl()).toThrow(/MASTRA_DB_URL is not set/);
  });

  it('throws for literal IPv6 host in connection string', async () => {
    vi.stubEnv(
      'MASTRA_DB_URL',
      'postgresql://user:pass@[2001:db8::1]:5432/db',
    );
    const { getResolvedMastraDbUrl } = await loadFresh();
    expect(() => getResolvedMastraDbUrl()).toThrow(/literal IPv6/i);
  });

  it('returns the connection string unchanged when host is already an IPv4 literal', async () => {
    const url = 'postgresql://u:p@10.0.0.1:5432/db';
    vi.stubEnv('MASTRA_DB_URL', url);
    const { getResolvedMastraDbUrl } = await loadFresh();
    await expect(getResolvedMastraDbUrl()).resolves.toBe(url);
  });

  it('returns the input unchanged when it cannot be parsed as a URL', async () => {
    vi.stubEnv('MASTRA_DB_URL', 'not-a-url');
    const { getResolvedMastraDbUrl } = await loadFresh();
    await expect(getResolvedMastraDbUrl()).resolves.toBe('not-a-url');
  });

  it('caches the result across calls within the same module instance', async () => {
    const url = 'postgresql://u:p@10.0.0.1:5432/db';
    vi.stubEnv('MASTRA_DB_URL', url);
    const { getResolvedMastraDbUrl } = await loadFresh();
    const first = await getResolvedMastraDbUrl();
    // Change env after the cache is populated; should not affect the cached value.
    vi.stubEnv('MASTRA_DB_URL', 'postgresql://u:p@10.0.0.2:5432/db');
    const second = await getResolvedMastraDbUrl();
    expect(second).toBe(first);
  });
});
