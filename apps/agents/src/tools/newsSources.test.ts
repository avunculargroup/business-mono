import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFakeSupabase } from '../../test/mocks/supabase.js';

const fake = createFakeSupabase();

vi.mock('@platform/db', () => ({
  get supabase() { return fake; },
}));

// Mock rss-parser so feed validation in the `add` path makes no network call.
const { parseURL } = vi.hoisted(() => ({ parseURL: vi.fn() }));
vi.mock('rss-parser', () => ({
  default: vi.fn().mockImplementation(() => ({ parseURL })),
}));

const { manageNewsSources } = await import('./newsSources.js');
const { resolveFeedUrl } = await import('@platform/shared');

function execute(input: Record<string, unknown>): Promise<unknown> {
  return manageNewsSources.execute!(input as never, {} as never) as Promise<unknown>;
}

describe('resolveFeedUrl', () => {
  it('prefers an explicit feed_url', () => {
    expect(resolveFeedUrl('https://bitcoinmagazine.com', 'https://bitcoinmagazine.com/feed'))
      .toBe('https://bitcoinmagazine.com/feed');
  });

  it('derives a Substack feed from the site_url', () => {
    expect(resolveFeedUrl('https://lynalden.substack.com', undefined))
      .toBe('https://lynalden.substack.com/feed');
    expect(resolveFeedUrl('https://lynalden.substack.com/', null))
      .toBe('https://lynalden.substack.com/feed');
  });

  it('returns null for a non-Substack site with no feed_url', () => {
    expect(resolveFeedUrl('https://bitcoinmagazine.com', undefined)).toBeNull();
    expect(resolveFeedUrl(undefined, undefined)).toBeNull();
  });
});

describe('manageNewsSources tool', () => {
  beforeEach(() => {
    fake.__builders.length = 0;
    fake.__responses.clear();
    fake.from.mockClear();
    parseURL.mockReset();
    parseURL.mockResolvedValue({ items: [] });
  });

  it('lists sources ordered by name', async () => {
    fake.__setResponse('news_sources', { data: [{ id: 's1', name: 'Bitcoin Magazine' }], error: null });
    const result = await execute({ action: 'list' });
    expect(result).toEqual({ sources: [{ id: 's1', name: 'Bitcoin Magazine' }] });
    const builder = fake.__buildersFor('news_sources')[0];
    expect(builder.order).toHaveBeenCalledWith('name', { ascending: true });
  });

  it('adds a source with an explicit feed_url', async () => {
    fake.__setResponse('news_sources', { data: { id: 's2' }, error: null });
    const result = await execute({
      action: 'add',
      name: 'Bitcoin Magazine',
      site_url: 'https://bitcoinmagazine.com',
      feed_url: 'https://bitcoinmagazine.com/feed',
    });
    expect(result).toEqual({ id: 's2', feed_url: 'https://bitcoinmagazine.com/feed' });
    const builder = fake.__buildersFor('news_sources')[0];
    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Bitcoin Magazine',
      feed_url: 'https://bitcoinmagazine.com/feed',
      is_active: true,
    }));
  });

  it('derives a Substack feed when adding without feed_url', async () => {
    fake.__setResponse('news_sources', { data: { id: 's3' }, error: null });
    const result = await execute({ action: 'add', name: 'Lyn Alden', site_url: 'https://lynalden.substack.com' });
    expect(result).toEqual({ id: 's3', feed_url: 'https://lynalden.substack.com/feed' });
  });

  it('rejects add when no feed can be resolved', async () => {
    const result = await execute({ action: 'add', name: 'Some Blog', site_url: 'https://example.com' });
    expect(result).toEqual({ error: expect.stringContaining('feed_url') });
    expect(fake.__buildersFor('news_sources')).toHaveLength(0);
  });

  it('validates the resolved feed before inserting', async () => {
    fake.__setResponse('news_sources', { data: { id: 's4' }, error: null });
    await execute({ action: 'add', name: 'Bitcoin Magazine', feed_url: 'https://bitcoinmagazine.com/feed' });
    expect(parseURL).toHaveBeenCalledWith('https://bitcoinmagazine.com/feed');
  });

  it('rejects add when the feed cannot be parsed', async () => {
    parseURL.mockRejectedValueOnce(new Error('Status code 404'));
    const result = await execute({ action: 'add', name: 'Broken', feed_url: 'https://example.com/feed' });
    expect(result).toEqual({ error: expect.stringContaining('404') });
    expect(fake.__buildersFor('news_sources')).toHaveLength(0);
  });

  it('rejects add with no name', async () => {
    const result = await execute({ action: 'add', feed_url: 'https://x.com/feed' });
    expect(result).toEqual({ error: expect.stringContaining('name is required') });
  });

  it('sets active state by id', async () => {
    fake.__setResponse('news_sources', { data: null, error: null });
    const result = await execute({ action: 'set_active', id: 's1', is_active: false });
    expect(result).toEqual({ id: 's1', is_active: false });
    const builder = fake.__buildersFor('news_sources')[0];
    expect(builder.update).toHaveBeenCalledWith({ is_active: false });
    expect(builder.eq).toHaveBeenCalledWith('id', 's1');
  });

  it('requires id and is_active for set_active', async () => {
    expect(await execute({ action: 'set_active', is_active: true })).toEqual({ error: expect.stringContaining('id is required') });
    expect(await execute({ action: 'set_active', id: 's1' })).toEqual({ error: expect.stringContaining('is_active') });
  });

  it('removes a source by id', async () => {
    fake.__setResponse('news_sources', { data: null, error: null });
    const result = await execute({ action: 'remove', id: 's1' });
    expect(result).toEqual({ id: 's1', removed: true });
    const builder = fake.__buildersFor('news_sources')[0];
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 's1');
  });

  it('throws when the insert errors', async () => {
    fake.__setResponse('news_sources', { data: null, error: { message: 'duplicate key' } });
    await expect(
      execute({ action: 'add', name: 'Dup', feed_url: 'https://x.com/feed' }),
    ).rejects.toThrow(/Failed to add news source: duplicate key/);
  });
});
