import { describe, it, expect } from 'vitest';
import { extractNewsletterLinks } from './newsletterLinks.js';

/** Anchor with readable text — the shape a real story link takes. */
function a(href: string, text = 'A substantive headline'): string {
  return `<a href="${href}">${text}</a>`;
}

const MANY = { max: 50 };

describe('extractNewsletterLinks', () => {
  it('keeps substantive article links in document order', () => {
    const html = a('https://afr.com/first', 'RBA holds') + a('https://wsj.com/second', 'Fed pivots');
    expect(extractNewsletterLinks(html, MANY)).toEqual([
      { url: 'https://afr.com/first', anchorText: 'RBA holds' },
      { url: 'https://wsj.com/second', anchorText: 'Fed pivots' },
    ]);
  });

  it('drops non-http schemes and relative hrefs', () => {
    const html =
      a('mailto:hi@example.com') +
      a('tel:+61400000000') +
      a('#section') +
      a('javascript:void(0)') +
      a('data:text/html,x') +
      a('/relative/path') +
      a('https://afr.com/keep');
    expect(extractNewsletterLinks(html, MANY).map((l) => l.url)).toEqual(['https://afr.com/keep']);
  });

  it('decodes &amp; in hrefs so query strings survive', () => {
    const html = a('https://afr.com/story?id=1&amp;page=2');
    expect(extractNewsletterLinks(html, MANY)[0]!.url).toBe('https://afr.com/story?id=1&page=2');
  });

  it('drops anchors whose text is newsletter chrome', () => {
    const html =
      a('https://pub.example/u/1', 'Unsubscribe') +
      a('https://pub.example/p/1', 'Manage your email preferences') +
      a('https://pub.example/v/1', 'View this email in your browser') +
      a('https://afr.com/keep', 'Real story');
    expect(extractNewsletterLinks(html, MANY).map((l) => l.url)).toEqual(['https://afr.com/keep']);
  });

  it('drops social and video hosts', () => {
    const html =
      a('https://twitter.com/someone') +
      a('https://www.linkedin.com/in/someone') +
      a('https://youtu.be/abc123') +
      a('https://www.youtube.com/watch?v=abc') +
      a('https://afr.com/keep');
    expect(extractNewsletterLinks(html, MANY).map((l) => l.url)).toEqual(['https://afr.com/keep']);
  });

  it('drops asset links wrapped in an anchor', () => {
    const html =
      a('https://track.example/pixel.gif') +
      a('https://cdn.example/logo.png') +
      a('https://afr.com/keep');
    expect(extractNewsletterLinks(html, MANY).map((l) => l.url)).toEqual(['https://afr.com/keep']);
  });

  it('keeps mailchimp track/click but drops its chrome paths', () => {
    const html =
      a('https://pub.us1.list-manage.com/track/click?u=1&amp;id=2', 'The real article') +
      a('https://pub.us1.list-manage.com/unsubscribe?u=1', 'Opt out') +
      a('https://pub.us1.list-manage.com/vcard?u=1', 'Add to address book') +
      a('https://pub.us1.list-manage.com/track/open?u=1', 'x');
    expect(extractNewsletterLinks(html, MANY).map((l) => l.url)).toEqual([
      'https://pub.us1.list-manage.com/track/click?u=1&id=2',
    ]);
  });

  it('strips campaign params so the same article dedups across sends', () => {
    const html = a('https://afr.com/story?utm_source=nl&utm_medium=email&mc_eid=abc&id=7&fbclid=z');
    expect(extractNewsletterLinks(html, MANY)[0]!.url).toBe('https://afr.com/story?id=7');
  });

  it('dedupes on host and path, ignoring www, case and trailing slash', () => {
    const html =
      a('https://www.AFR.com/Story/') +
      a('https://afr.com/Story') +
      a('https://afr.com/Story?utm_source=x');
    expect(extractNewsletterLinks(html, MANY)).toHaveLength(1);
  });

  it('never follows the parent item own urls', () => {
    const html = a('https://pub.example/issue/42', 'View online copy') + a('https://afr.com/keep');
    const links = extractNewsletterLinks(html, {
      max: 50,
      excludeUrls: ['https://www.pub.example/issue/42/', 'email://gromen/%3Cabc%3E'],
    });
    expect(links.map((l) => l.url)).toEqual(['https://afr.com/keep']);
  });

  it('caps at max, keeping the earliest links', () => {
    const html = a('https://a.example/1') + a('https://b.example/2') + a('https://c.example/3');
    expect(extractNewsletterLinks(html, { max: 2 }).map((l) => l.url)).toEqual([
      'https://a.example/1',
      'https://b.example/2',
    ]);
  });

  it('returns nothing when max is zero', () => {
    expect(extractNewsletterLinks(a('https://afr.com/keep'), { max: 0 })).toEqual([]);
  });

  it('drops image-only anchors', () => {
    const html =
      '<a href="https://sponsor.example/promo"><img src="https://cdn.example/banner.png"></a>' +
      a('https://afr.com/keep');
    expect(extractNewsletterLinks(html, MANY).map((l) => l.url)).toEqual(['https://afr.com/keep']);
  });

  it('keeps generic and bare-url anchors but reports no anchor text', () => {
    const html =
      a('https://afr.com/one', 'Read more') +
      a('https://afr.com/two', 'https://afr.com/two') +
      a('https://afr.com/three', '→');
    expect(extractNewsletterLinks(html, MANY)).toEqual([
      { url: 'https://afr.com/one', anchorText: '' },
      { url: 'https://afr.com/two', anchorText: '' },
      { url: 'https://afr.com/three', anchorText: '' },
    ]);
  });

  it('collapses tags and whitespace inside anchor text', () => {
    const html = '<a href="https://afr.com/x"><strong>RBA</strong>\n  holds  rates</a>';
    expect(extractNewsletterLinks(html, MANY)[0]!.anchorText).toBe('RBA holds rates');
  });

  it('does not throw on malformed markup', () => {
    const html = '<a href="ht tp://bad">x</a><a href=>y</a><a>z</a>' + a('https://afr.com/keep');
    expect(extractNewsletterLinks(html, MANY).map((l) => l.url)).toEqual(['https://afr.com/keep']);
  });

  it('is reusable across calls (regex lastIndex is not shared)', () => {
    const html = a('https://afr.com/one') + a('https://afr.com/two');
    const first = extractNewsletterLinks(html, MANY);
    expect(extractNewsletterLinks(html, MANY)).toEqual(first);
  });
});
