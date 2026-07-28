import { describe, it, expect } from 'vitest';
import { newsItemHref } from './itemHref';

describe('newsItemHref', () => {
  it('links out for http and https urls', () => {
    expect(newsItemHref('a1', 'https://afr.com/story')).toEqual({
      href: 'https://afr.com/story',
      external: true,
    });
    expect(newsItemHref('a1', 'http://afr.com/story')).toEqual({
      href: 'http://afr.com/story',
      external: true,
    });
  });

  it('trims surrounding whitespace on an external url', () => {
    expect(newsItemHref('a1', '  https://afr.com/story  ').href).toBe('https://afr.com/story');
  });

  it('routes synthetic email urls to the in-app reading view', () => {
    expect(newsItemHref('item-9', 'email://gromen/issue-42%40gromen.com')).toEqual({
      href: '/news/item-9',
      external: false,
    });
  });

  it('routes anything else, including empty and malformed values, in-app', () => {
    expect(newsItemHref('item-9', '').href).toBe('/news/item-9');
    expect(newsItemHref('item-9', 'javascript:alert(1)').href).toBe('/news/item-9');
    expect(newsItemHref('item-9', 'not a url').href).toBe('/news/item-9');
  });
});
