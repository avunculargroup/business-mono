import { describe, it, expect, vi } from 'vitest';
import TurndownService from 'turndown';
import {
  getHtmlBody,
  htmlToMarkdown,
  normaliseMarkdown,
  extractCanonicalUrl,
  synthesizeEmailUrl,
  senderAllowed,
} from './newsletterExtract.js';
import { buildJmapEmail } from '../../test/factories.js';

describe('getHtmlBody', () => {
  it('returns the html part value', () => {
    const email = buildJmapEmail({ htmlBody: '<p>hi</p>' });
    expect(getHtmlBody(email)).toBe('<p>hi</p>');
  });
  it('returns null when the html part is blank', () => {
    const email = buildJmapEmail({ htmlBody: '   ' });
    expect(getHtmlBody(email)).toBeNull();
  });
});

describe('htmlToMarkdown', () => {
  it('converts headings and links and drops images', () => {
    const md = htmlToMarkdown(
      '<h1>Tree Rings</h1><p>Fiscal <a href="https://x.com/a">dominance</a> note.</p><img src="https://t.example/pixel.gif">',
    );
    expect(md).toContain('# Tree Rings');
    expect(md).toContain('[dominance](https://x.com/a)');
    expect(md).not.toContain('pixel.gif');
    expect(md).not.toContain('![');
  });

  it('removes style and script blocks', () => {
    const md = htmlToMarkdown('<style>p{color:red}</style><script>track()</script><p>visible</p>');
    expect(md).toContain('visible');
    expect(md).not.toContain('color:red');
    expect(md).not.toContain('track(');
  });

  it('collapses blank-line runs', () => {
    const md = htmlToMarkdown('<p>a</p><p></p><p></p><p>b</p>');
    expect(md).not.toMatch(/\n{3,}/);
  });

  // Turndown was silently throwing inside the deploy bundle for a month, and the
  // fallback shipped the email's stylesheet into news_items as body text.
  it('keeps css and entities out of the body when turndown throws', () => {
    const spy = vi.spyOn(TurndownService.prototype, 'turndown').mockImplementation(() => {
      throw new TypeError('DOMImplementation$2 is not a constructor');
    });
    try {
      const md = htmlToMarkdown(
        '<html><head><style>@media only screen{.wrapper{font-size:8px !important}}</style></head>' +
          '<body><p>ASIC&nbsp;released a <a href="https://asic.gov.au/mr">media release</a>.</p></body></html>',
      );
      expect(md).toContain('ASIC released a');
      expect(md).toContain('media release');
      expect(md).not.toContain('@media');
      expect(md).not.toContain('!important');
      expect(md).not.toContain('&nbsp;');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('extractCanonicalUrl', () => {
  it('finds a "view in browser" link', () => {
    const html = '<a href="https://pub.example/issue/1">View in browser</a><p>body</p>';
    expect(extractCanonicalUrl(html)).toBe('https://pub.example/issue/1');
  });
  it('matches "view online" too', () => {
    const html = '<a href="https://pub.example/online">View online &raquo;</a>';
    expect(extractCanonicalUrl(html)).toBe('https://pub.example/online');
  });
  it('returns null when no matching anchor exists', () => {
    expect(extractCanonicalUrl('<a href="https://x.com">Unsubscribe</a>')).toBeNull();
  });
  it('ignores non-http hrefs', () => {
    expect(extractCanonicalUrl('<a href="mailto:x@y">view in browser</a>')).toBeNull();
  });
});

describe('synthesizeEmailUrl', () => {
  it('is stable and url-encodes the key', () => {
    expect(synthesizeEmailUrl('gromen', 'abc@mail.com')).toBe('email://gromen/abc%40mail.com');
  });
});

describe('senderAllowed', () => {
  it('allows anything when the allowlist is empty (onboarding)', () => {
    expect(senderAllowed('anyone@anywhere.com', [])).toBe(true);
  });
  it('matches a domain entry', () => {
    expect(senderAllowed('news@gromen.com', ['gromen.com'])).toBe(true);
    expect(senderAllowed('news@other.com', ['gromen.com'])).toBe(false);
  });
  it('matches a full-address entry', () => {
    expect(senderAllowed('luke@gromen.com', ['luke@gromen.com'])).toBe(true);
    expect(senderAllowed('other@gromen.com', ['luke@gromen.com'])).toBe(false);
  });
  it('is case-insensitive', () => {
    expect(senderAllowed('News@Gromen.com', ['GROMEN.COM'])).toBe(true);
  });
});

describe('normaliseMarkdown', () => {
  it('removes invisible preheader characters and turns non-breaking spaces into spaces', () => {
    expect(normaliseMarkdown('A\u034f\u00ad\u200b\u200c\u200d\u2060\ufeff\u2007B\u00a0C')).toBe('AB C');
  });

  it('removes empty links and image markdown', () => {
    expect(normaliseMarkdown('[](https://t.example/x) [ ](https://t.example/y)Text ![Image 1: chart](https://cdn/x.png)')).toBe('Text');
  });

  it('undoes escaping that changes nothing in rendering', () => {
    expect(normaliseMarkdown('down \\-2.5% in the U\\.S\\. today')).toBe('down -2.5% in the U.S. today');
  });

  it('keeps escaping that does change rendering', () => {
    // A leading \- would become a list item; 1\. would become an ordered list.
    expect(normaliseMarkdown('\\- not a list\n\n2026\\. not a list')).toBe('\\- not a list\n\n2026\\. not a list');
  });

  it('drops the first line when it only repeats the subject', () => {
    expect(normaliseMarkdown('\n# Tree Rings — Issue 42!\n\nBody', { subject: 'Tree rings: issue 42' })).toBe('Body');
    expect(normaliseMarkdown('Intro\n\nTree Rings', { subject: 'Tree Rings' })).toBe('Intro\n\nTree Rings');
  });

  it('collapses repeated lines, even across blank lines, then blank-line runs', () => {
    expect(normaliseMarkdown('View in browser\n\nView in browser\n\n\n\nBody\nBody')).toBe('View in browser\n\nBody');
  });

  it('trims', () => {
    expect(normaliseMarkdown('  \n\nBody  \n\n')).toBe('Body');
  });
});
