import { describe, it, expect } from 'vitest';
import { renderNewsDigestEmail } from './newsDigestEmail.js';
import type { RoutineResult } from '@platform/shared';

const company = {
  name: 'Bitcoin Treasury Solutions',
  website: 'https://www.bitcointreasurysolutions.com.au',
  abn: '82683088173',
};

function sampleResult(): RoutineResult {
  return {
    summary: 'Curated 2 stories.',
    sources: [],
    metadata: {
      mood_summary: 'Treasury desks lean in as Australian regulators sharpen their stance',
      headline_image_url: 'https://img.example/og.png',
      more_news_url: '/news',
      stories: [
        {
          kind: 'news',
          id: '1',
          title: 'ASIC updates digital asset guidance - The AFR',
          url: 'https://afr.example/asic',
          source_name: 'AFR',
          category: 'regulatory',
        },
        {
          kind: 'podcast',
          id: '2',
          title: 'Treasury special',
          url: 'https://pod.example/ep',
          source_name: 'What Bitcoin Did',
          category: 'podcast',
        },
      ],
    },
  };
}

const date = new Date('2026-06-18T00:00:00Z'); // 18 June 2026 in Australia/Melbourne

describe('renderNewsDigestEmail', () => {
  it('builds a branded subject with company name and Melbourne date', () => {
    const { subject } = renderNewsDigestEmail({ title: 'Daily news curation', result: sampleResult(), date, company });
    expect(subject).toContain('Bitcoin Treasury Solutions');
    expect(subject).toContain('18 June 2026');
  });

  it('renders each story as a linked, source-suffix-cleaned headline', () => {
    const { html } = renderNewsDigestEmail({ title: 'Daily news curation', result: sampleResult(), date, company });
    // Trailing " - The AFR" suffix is stripped (it shows as the source badge instead).
    expect(html).toContain('ASIC updates digital asset guidance');
    expect(html).not.toContain('ASIC updates digital asset guidance - The AFR');
    expect(html).toContain('href="https://afr.example/asic"');
    expect(html).toContain('href="https://pod.example/ep"');
    expect(html).toContain('What Bitcoin Did');
  });

  it('shows the mood summary and headline image', () => {
    const { html } = renderNewsDigestEmail({ title: 'Daily news curation', result: sampleResult(), date, company });
    expect(html).toContain('Treasury desks lean in');
    expect(html).toContain('src="https://img.example/og.png"');
  });

  it('renders the "More news" button only when the link can be made absolute', () => {
    const withBase = renderNewsDigestEmail({
      title: 'X',
      result: sampleResult(),
      date,
      company,
      webAppUrl: 'https://app.example/',
    });
    expect(withBase.html).toContain('href="https://app.example/news"');
    expect(withBase.html).toContain('Read more news');

    // Relative more_news_url with no base → omit the button rather than emit a dead link.
    const noBase = renderNewsDigestEmail({ title: 'X', result: sampleResult(), date, company });
    expect(noBase.html).not.toContain('Read more news');
  });

  it('always shows the BTS icon as the header avatar from a public URL, independent of webAppUrl', () => {
    const logoSrc = 'src="https://hq.btreasury.com.au/share/55d6f441-956e-4fec-a937-d5e37fb99727"';

    const withBase = renderNewsDigestEmail({
      title: 'X',
      result: sampleResult(),
      date,
      company,
      webAppUrl: 'https://app.example/',
    });
    expect(withBase.html).toContain(logoSrc);

    // The logo no longer depends on the internal app's (auth-gated) base URL.
    const noBase = renderNewsDigestEmail({ title: 'X', result: sampleResult(), date, company });
    expect(noBase.html).toContain(logoSrc);
    expect(noBase.html).not.toContain('android-chrome-192x192.png');
  });

  it('puts ABN and website in the footer', () => {
    const { html } = renderNewsDigestEmail({ title: 'X', result: sampleResult(), date, company });
    expect(html).toContain('ABN 82683088173');
    expect(html).toContain('www.bitcointreasurysolutions.com.au');
  });

  it('escapes HTML in titles and rejects non-http links', () => {
    const result = sampleResult();
    (result.metadata as { stories: Array<Record<string, unknown>> }).stories = [
      { kind: 'news', id: '1', title: 'Markets <script>alert(1)</script> rally', url: 'javascript:alert(1)', source_name: 'X', category: 'news' },
    ];
    const { html } = renderNewsDigestEmail({ title: 'X', result, date, company });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    // A non-http(s) URL must never become an href.
    expect(html).not.toContain('javascript:alert(1)');
  });

  it('produces a plain-text part with a numbered list and URLs', () => {
    const { text } = renderNewsDigestEmail({ title: 'Daily news curation', result: sampleResult(), date, company });
    expect(text).toContain('1. ASIC updates digital asset guidance (AFR)');
    expect(text).toContain('https://afr.example/asic');
    expect(text).toContain('ABN 82683088173');
  });

  it('falls back to sources[] when metadata.stories is absent', () => {
    const result: RoutineResult = {
      summary: 'mood from summary',
      sources: [{ url: 'https://x.example/a', title: 'A story - Some Paper', source: 'Some Paper', excerpt: '', retrieved_at: '' }],
      metadata: { more_news_url: '/news' },
    };
    const { html } = renderNewsDigestEmail({ title: 'X', result, date, company });
    expect(html).toContain('A story');
    expect(html).toContain('href="https://x.example/a"');
    expect(html).toContain('mood from summary');
  });
});
