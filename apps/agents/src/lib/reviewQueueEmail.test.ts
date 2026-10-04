import { describe, it, expect } from 'vitest';
import { renderReviewQueueEmail } from './reviewQueueEmail.js';

const company = { name: 'Bitcoin Treasury Solutions', abn: '12 345 678 901' };
const entries = [
  { legalName: 'Strategy Inc', slug: 'strategy', queuedRows: 3 },
  { legalName: 'Metaplanet Inc.', slug: 'metaplanet', queuedRows: 1 },
];

describe('renderReviewQueueEmail', () => {
  it('counts rows and records in the subject', () => {
    const { subject } = renderReviewQueueEmail({ entries, company });

    expect(subject).toBe('Corporate research: 4 rows to review on 2 records');
  });

  it('links each record and the queue when the app url is known', () => {
    const { html, text } = renderReviewQueueEmail({
      entries,
      company,
      webAppUrl: 'https://app.example/',
    });

    expect(html).toContain('href="https://app.example/research/strategy"');
    expect(html).toContain('href="https://app.example/research?view=review"');
    expect(text).toContain('Strategy Inc: 3 rows (https://app.example/research/strategy)');
  });

  it('omits links rather than inventing a host when the app url is not set', () => {
    const { html } = renderReviewQueueEmail({ entries, company });

    expect(html).not.toContain('href=');
  });

  it('says drafts reach no subscriber, and carries no figure from the rows', () => {
    // The rows are unread drafts; an email is the wrong place for their numbers.
    const { text } = renderReviewQueueEmail({ entries, company });

    expect(text).toContain('reach no subscriber until someone approves them');
    expect(text).not.toMatch(/\b(btc|bitcoin|AUD|USD)\b\s*\d|\d[\d,.]*\s*(btc|bitcoin)\b/i);
  });

  it('escapes a record name', () => {
    const { html } = renderReviewQueueEmail({
      entries: [{ legalName: 'A & <B>', slug: 'a', queuedRows: 1 }],
      company,
    });

    expect(html).toContain('A &amp; &lt;B&gt;');
    expect(html).not.toContain('<B>');
  });
});
