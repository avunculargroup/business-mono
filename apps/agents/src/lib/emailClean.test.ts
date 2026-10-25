import { describe, it, expect } from 'vitest';
import { cleanEmailHtml } from './emailClean.js';

const filler = (n: number) => `<p>${'Real issue content. '.repeat(n)}</p>`;
const clean = (html: string) => cleanEmailHtml(`<html><body>${html}</body></html>`);

describe('cleanEmailHtml', () => {
  describe('hidden elements', () => {
    it.each([
      'display:none',
      'display: none !important',
      'visibility:hidden',
      'mso-hide:all',
    ])('removes an element styled %s, whatever its length', (style) => {
      const { html, removed } = clean(`<div style="${style}">${'Preview text. '.repeat(100)}</div><p>Body</p>`);
      expect(html).not.toContain('Preview text');
      expect(removed.hidden).toBe(1);
    });

    it.each(['max-height:0', 'max-height:0px', 'opacity:0', 'font-size:0', 'font-size:0px'])(
      'removes a short element styled %s',
      (style) => {
        expect(clean(`<span style="${style}">Preview͏͏͏</span><p>Body</p>`).html).not.toContain('Preview');
      },
    );

    it('keeps a long font-size:0 wrapper, the inline-block column pattern', () => {
      const { html } = clean(`<td style="font-size:0"><div style="display:inline-block;font-size:16px">${'Column text. '.repeat(40)}</div></td>`);
      expect(html).toContain('Column text.');
    });

    it('does not mistake opacity:0.5 or max-height:0.5em for hidden', () => {
      const { html } = clean('<p style="opacity:0.5">faded</p><p style="max-height:0.5em">tight</p>');
      expect(html).toContain('faded');
      expect(html).toContain('tight');
    });

    it('removes preheader and preview-text classes and the hidden attribute', () => {
      const { html } = clean('<div class="x preheader">a</div><span class="preview-text">b</span><p hidden>c</p><p>Body</p>');
      expect(html).not.toMatch(/>[abc]</);
    });
  });

  it('removes anchors that wrap only an image', () => {
    const { html, removed } = clean('<a href="https://sponsor.example"><img src="b.png"></a><a href="https://afr.com">Story</a>');
    expect(html).not.toContain('sponsor.example');
    expect(html).toContain('Story');
    expect(removed.imageAnchors).toBe(1);
  });

  it('removes chrome anchors by their text', () => {
    const { html, removed } = clean('<p><a href="https://p.example/v">View in browser</a> <a href="https://p.example/s">Share</a></p><p><a href="https://afr.com">Story</a></p>');
    expect(html).not.toContain('View in browser');
    expect(html).not.toContain('Share');
    expect(removed.chromeAnchors).toBe(2);
  });

  describe('footer', () => {
    it('cuts the block holding the unsubscribe link and everything after it', () => {
      const { html, removed } = clean(
        `${filler(40)}<div><p>You get this because you subscribed. <a href="https://p.example/unsubscribe">Unsubscribe</a></p></div><p>1 Placeholder St</p>`,
      );
      expect(html).toContain('Real issue content');
      expect(html).not.toContain('You get this because');
      expect(html).not.toContain('Placeholder St');
      expect(removed.footer).toBeGreaterThan(0);
    });

    it('finds the footer by text when the link is a wrapper', () => {
      const { html } = clean(`${filler(40)}<p>To unsubscribe, <a href="https://d1.na1.hubspotlinks.com/x">click here</a>.</p>`);
      expect(html).not.toContain('To unsubscribe');
    });

    it('uses the last marker, not a "manage preferences" link in the header', () => {
      const { html } = clean(`<p><a href="https://p.example/preferences">Manage preferences</a> header</p>${filler(40)}<p><a href="https://p.example/unsubscribe">Unsubscribe</a> footer</p>`);
      expect(html).toContain('Real issue content');
      expect(html).not.toContain('footer');
    });

    it('refuses a cut over 25% of the text', () => {
      // The marker block is small, but what follows it is most of the issue.
      const { html, removed } = clean(`<p>Short intro.</p><p><a href="https://p.example/unsubscribe">Unsubscribe</a> anytime</p>${filler(40)}`);
      expect(html).toContain('Real issue content');
      expect(html).toContain('anytime');
      expect(removed.footerGuarded).toBe(true);
      expect(removed.footer).toBe(0);
    });

    it('never picks a block that is itself over 25% of a short email', () => {
      const { html, removed } = clean(`<div><p>${'Short issue body. '.repeat(8)}</p><p><a href="https://p.example/unsubscribe">Unsubscribe</a></p></div>`);
      expect(html).toContain('Short issue body');
      expect(removed.footer).toBe(1);
    });
  });

  describe('layout tables', () => {
    it.each([
      ['role="presentation"', '<table role="presentation"><tr><td>a</td><td>b</td></tr></table>'],
      ['a width attribute', '<table width="600"><tr><td>a</td><td>b</td></tr></table>'],
      ['a block inside a cell', '<table><tr><td><p>a</p></td><td>b</td></tr></table>'],
    ])('unwraps a table with %s, keeping cell order', (_label, table) => {
      const { html, removed } = clean(table);
      expect(html).not.toMatch(/<t(able|r|d)/);
      expect(html.indexOf('a')).toBeLessThan(html.indexOf('b'));
      expect(removed.layoutTables).toBe(1);
    });

    it('keeps a data table and promotes its first row to a header', () => {
      const { html, removed } = clean('<table><tr><td>Metric</td><td>Value</td></tr><tr><td>Hashrate</td><td>1</td></tr></table>');
      expect(html).toContain('<th>Metric</th>');
      expect(html).toContain('<td>Hashrate</td>');
      expect(removed.layoutTables).toBe(0);
    });

    it('unwraps nested layout tables around a data table', () => {
      const { html } = clean('<table role="presentation"><tr><td><table><tr><td>A</td></tr><tr><td>1</td></tr></table></td></tr></table>');
      expect(html).toContain('<th>A</th>');
      expect(html.match(/<table/g)).toHaveLength(1);
    });
  });

  describe('links', () => {
    it('strips tracking parameters from a direct link', () => {
      const { html, removed } = clean('<a href="https://afr.com/a?utm_source=nl&amp;id=1">Story</a>');
      expect(html).toContain('href="https://afr.com/a?id=1"');
      expect(removed.linksCleaned).toBe(1);
    });

    it('decodes an encodable wrapper', () => {
      const payload = Buffer.from('https://seekingalpha.com/article/1-x?userid=9').toString('base64');
      const { html } = clean(`<a href="https://email-st.seekingalpha.com/click/1.2/${payload}/sig">Story</a>`);
      expect(html).toContain('href="https://seekingalpha.com/article/1-x"');
    });

    it('reduces an opaque wrapper to its text', () => {
      const { html, removed } = clean('<p>See <a href="https://example.ghost.io/r/0a1b2c3d?m=placeholder">the report</a>.</p>');
      expect(html).toContain('See the report.');
      expect(html).not.toContain('ghost.io');
      expect(removed.linksTextOnly).toBe(1);
    });

    it('leaves mailto and relative links alone', () => {
      const { html } = clean('<a href="mailto:a@example.com">Email us</a>');
      expect(html).toContain('mailto:a@example.com');
    });
  });

  it('drops style, script and head content', () => {
    const { html } = cleanEmailHtml('<html><head><title>T</title><style>p{}</style></head><body><script>x()</script><p>Body</p></body></html>');
    expect(html).toBe('<p>Body</p>');
  });

  it('honours disable, for the fixture coverage test', () => {
    const { html } = cleanEmailHtml('<body><div style="display:none">Preview</div></body>', { disable: ['hidden'] });
    expect(html).toContain('Preview');
  });
});
