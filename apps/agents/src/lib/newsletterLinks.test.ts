import { describe, it, expect } from 'vitest';
import { extractNewsletterLinks, linkDenyReason } from './newsletterLinks.js';

/** Anchor with readable text — the shape a real story link takes. */
function a(href: string, text = 'A substantive headline'): string {
  return `<a href="${href}">${text}</a>`;
}

const MANY = {};

const b64 = (v: string) => Buffer.from(v).toString('base64');

describe('extractNewsletterLinks', () => {
  it('keeps substantive article links in document order', () => {
    const html = a('https://afr.com/first', 'RBA holds') + a('https://wsj.com/second', 'Fed pivots');
    expect(extractNewsletterLinks(html, MANY)).toEqual([
      { url: 'https://afr.com/first', anchorText: 'RBA holds', wrapped: false },
      { url: 'https://wsj.com/second', anchorText: 'Fed pivots', wrapped: false },
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

  it('keeps mailchimp track/click as a wrapped link but drops its chrome paths', () => {
    const html =
      a('https://pub.us1.list-manage.com/track/click?u=1&amp;id=2', 'The real article') +
      a('https://pub.us1.list-manage.com/unsubscribe?u=1', 'Opt out') +
      a('https://pub.us1.list-manage.com/vcard?u=1', 'Add to address book') +
      a('https://pub.us1.list-manage.com/track/open?u=1', 'x');
    expect(extractNewsletterLinks(html, MANY)).toEqual([
      { url: 'https://pub.us1.list-manage.com/track/click?u=1&id=2', anchorText: 'The real article', wrapped: true },
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
      excludeUrls: ['https://www.pub.example/issue/42/', 'email://gromen/%3Cabc%3E'],
    });
    expect(links.map((l) => l.url)).toEqual(['https://afr.com/keep']);
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
      { url: 'https://afr.com/one', anchorText: '', wrapped: false },
      { url: 'https://afr.com/two', anchorText: '', wrapped: false },
      { url: 'https://afr.com/three', anchorText: '', wrapped: false },
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

  it('decodes a Seeking Alpha click link and filters on the real URL', () => {
    const story = `https://email-st.seekingalpha.com/click/1.2/${b64('https://seekingalpha.com/article/1-btc?userid=9&mailingid=1')}/sig`;
    const social = `https://email-st.seekingalpha.com/click/1.3/${b64('https://twitter.com/seekingalpha')}/sig`;
    const html = a(story, 'Bitcoin treasury firms') + a(social, 'Follow the desk');
    expect(extractNewsletterLinks(html, MANY)).toEqual([
      { url: 'https://seekingalpha.com/article/1-btc', anchorText: 'Bitcoin treasury firms', wrapped: false },
    ]);
  });

  it('dedupes decoded links on the destination, not the per-send wrapper', () => {
    const dest = b64('https://seekingalpha.com/article/1-btc');
    const html = a(`https://email-st.seekingalpha.com/click/1.2/${dest}/sigA`) + a(`https://email-st.seekingalpha.com/click/1.9/${dest}/sigB`);
    expect(extractNewsletterLinks(html, MANY)).toHaveLength(1);
  });

  it('returns opaque wrappers unresolved, flagged wrapped', () => {
    const html = a('https://example.ghost.io/r/0a1b2c3d?m=placeholder', 'A headline');
    expect(extractNewsletterLinks(html, MANY)).toEqual([
      { url: 'https://example.ghost.io/r/0a1b2c3d?m=placeholder', anchorText: 'A headline', wrapped: true },
    ]);
  });

  it('applies no cap — the listener caps after filtering', () => {
    const html = Array.from({ length: 30 }, (_, i) => a(`https://afr.com/story-${i}`)).join('');
    expect(extractNewsletterLinks(html)).toHaveLength(30);
  });
});

describe('linkDenyReason', () => {
  it('allows a plain article', () => {
    expect(linkDenyReason('https://afr.com/markets/rba-holds')).toBeNull();
  });

  it('denies social hosts, assets and chrome paths on the real URL', () => {
    expect(linkDenyReason('https://x.com/someone/status/1')).toBe('deny_host');
    expect(linkDenyReason('https://cdn.example/logo.png')).toBe('asset');
    expect(linkDenyReason('https://seekingalpha.com/account/subscriptions')).toBe('deny_path');
  });

  it('denies Substack profile and app links', () => {
    expect(linkDenyReason('https://substack.com/@someone')).toBe('deny_path');
    expect(linkDenyReason('https://substack.com/app-link/post?post_id=1')).toBe('deny_path');
    expect(linkDenyReason('https://open.substack.com/pub/x/p/a-post')).toBeNull();
  });

  it("denies the newsletter's own hosts, including subdomains", () => {
    const rules = { selfHosts: ['tftc.io'] };
    expect(linkDenyReason('https://www.tftc.io/issue-600', rules)).toBe('self_link');
    expect(linkDenyReason('https://shop.tftc.io/x', rules)).toBe('self_link');
    expect(linkDenyReason('https://nottftc.io/x', rules)).toBeNull();
  });

  it('never treats a shared sending platform as a self host', () => {
    const rules = { selfHosts: ['substack.com', 'example.ghost.io'] };
    expect(linkDenyReason('https://open.substack.com/pub/other/p/a-post', rules)).toBeNull();
    // A publication's own subdomain on the platform still counts.
    expect(linkDenyReason('https://example.ghost.io/issue-601', rules)).toBe('self_link');
    expect(linkDenyReason('https://other.ghost.io/post', rules)).toBeNull();
  });

  it('lets an allow pattern override the self rule, for gateway newsletters', () => {
    const rules = { selfHosts: ['seekingalpha.com'], allowPatterns: ['seekingalpha.com/article/'] };
    expect(linkDenyReason('https://seekingalpha.com/article/1-btc', rules)).toBeNull();
    expect(linkDenyReason('https://seekingalpha.com/news/1-btc', rules)).toBe('source_allow');
  });

  it('applies source deny patterns as host or host-plus-path prefixes', () => {
    const rules = { denyPatterns: ['open.substack.com/pub/pomp/', 'events.example.com'] };
    expect(linkDenyReason('https://open.substack.com/pub/pomp/p/x', rules)).toBe('source_deny');
    expect(linkDenyReason('https://open.substack.com/pub/other/p/x', rules)).toBeNull();
    expect(linkDenyReason('https://events.example.com/tickets', rules)).toBe('source_deny');
  });

  it('requires a match when source allow patterns are set', () => {
    const rules = { allowPatterns: ['seekingalpha.com/article/'] };
    expect(linkDenyReason('https://seekingalpha.com/article/1-btc', rules)).toBeNull();
    expect(linkDenyReason('https://seekingalpha.com/news/1-btc', rules)).toBe('source_allow');
    expect(linkDenyReason('https://afr.com/x', rules)).toBe('source_allow');
    expect(linkDenyReason('https://afr.com/x', { allowPatterns: ['  '] })).toBeNull();
  });
});
