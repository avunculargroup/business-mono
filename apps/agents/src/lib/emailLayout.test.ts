import { describe, it, expect } from 'vitest';
import { T, emailShell } from './emailLayout.js';
import { renderNewsDigestEmail } from './newsDigestEmail.js';
import { renderMarketReportEmail } from './marketReportEmail.js';
import { renderSocialDraftEmail } from './socialDraftEmail.js';
import { renderReviewQueueEmail } from './reviewQueueEmail.js';

const company = { name: 'Bitcoin Treasury Solutions', abn: '82683088173', website: 'https://www.bitcointreasurysolutions.com.au' };
const date = new Date('2026-06-18T00:00:00Z');

function allEmails(): string[] {
  return [
    renderNewsDigestEmail({
      title: 'Daily Digest',
      greeting: 'Morning Chris,',
      date,
      company,
      webAppUrl: 'https://app.example',
      result: {
        summary: '',
        metadata: {
          mood_summary: 'Quietly constructive.',
          headline_image_url: 'https://img.example/og.png',
          more_news_url: '/news',
          stories: [{ id: 'n1', title: 'ASIC updates guidance', url: 'https://afr.example/a', source_name: 'AFR', kind: 'news', paywalled: true }],
        },
      } as never,
    }).html,
    renderMarketReportEmail({
      title: 'Market report',
      date,
      company,
      narration: 'Hash rate up.\n\nFlows positive.',
      reviewUrl: 'https://app.example/r/1',
      sections: [{ heading: 'Price', items: [{ label: 'BTC / AUD', value: '$148,320', delta: '+4.2%', signal: 'neutral' }] }],
    } as never).html,
    renderSocialDraftEmail({
      founderName: 'Chris',
      story: { title: 'RBA holds', url: 'https://news.example/rba', source_name: 'AFR' },
      webAppUrl: 'https://app.example',
      company,
      posts: [
        {
          contentItemId: 'c1',
          platform: 'linkedin',
          accountName: 'Chris',
          title: '',
          body: 'Body',
          segments: [],
          isThread: false,
          classification: 'general_advice',
          needsDisclaimer: true,
          image: { url: 'https://signed.example/li.png', altText: 'A scale.', moreOptions: 2 },
        },
      ],
    }).html,
    renderReviewQueueEmail({ entries: [{ legalName: 'Strategy Inc', slug: 'strategy', queuedRows: 3 }], webAppUrl: 'https://app.example', company }).html,
  ];
}

describe('emailLayout', () => {
  it('keeps every font size in every team email on the bts-design type scale', () => {
    const allowed = new Set<string>([...Object.values(T), '1px' /* hidden preheader */, '0' /* spacer */]);
    for (const html of allEmails()) {
      const sizes = [...html.matchAll(/font-size:\s*([^;"]+)/g)].map((m) => m[1]!.trim());
      expect(sizes.filter((s) => !allowed.has(s))).toEqual([]);
    }
  });

  it('gives every team email a hidden preheader and the full footer', () => {
    for (const html of allEmails()) {
      expect(html).toMatch(/<div style="display:none;[^"]*mso-hide:all;/);
      expect(html).toContain('ABN 82683088173');
      expect(html).toContain('www.bitcointreasurysolutions.com.au</a>');
    }
  });

  it('escapes the preheader', () => {
    const html = emailShell({ subject: 'S', preheader: '<b>x</b>', rows: '', company });
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });
});
