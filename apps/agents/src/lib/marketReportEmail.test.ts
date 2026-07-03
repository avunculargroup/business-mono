import { describe, it, expect } from 'vitest';
import { renderMarketReportEmail } from './marketReportEmail.js';
import type { MarketReportSection } from '@platform/shared';

const sections: MarketReportSection[] = [
  {
    heading: 'On-chain',
    items: [
      { label: 'Hash Ribbons', value: '3.20', signal: 'neutral', delta: null, as_of: '2026-07-03' },
      { label: 'MVRV', value: '2.10', signal: null, delta: '▲ +0.05 (+2.44%) on prior', as_of: '2026-07-03' },
    ],
  },
  {
    heading: 'Macro',
    items: [
      { label: 'US 10Y', value: '3.85 %', signal: null, delta: '▼ −0.03 (−0.77%) on prior', as_of: '2026-07-02' },
    ],
  },
];

const company = { name: 'Bitcoin Treasury Solutions', website: 'https://www.bts.example', abn: '82683088173' };

describe('renderMarketReportEmail', () => {
  const { subject, html, text } = renderMarketReportEmail({
    title: 'Daily market report',
    sections,
    date: new Date('2026-07-03T22:00:00Z'), // → 4 July in Australia/Melbourne
    company,
  });

  it('dates the subject in the Melbourne timezone', () => {
    expect(subject).toBe('Market Report — 4 July 2026');
  });

  it('renders both section headings, labels, values, deltas and the signal chip', () => {
    expect(html).toContain('On-chain');
    expect(html).toContain('Macro');
    expect(html).toContain('Hash Ribbons');
    expect(html).toContain('neutral'); // signal chip
    expect(html).toContain('3.85 %');
    expect(html).toContain('+2.44%');
    expect(html).toContain('−0.77%');
  });

  it('escapes HTML in values to prevent markup injection', () => {
    const evil = renderMarketReportEmail({
      title: 'x',
      sections: [{ heading: 'On-chain', items: [{ label: '<b>x</b>', value: '1', signal: null, delta: null }] }],
      date: new Date('2026-07-03T22:00:00Z'),
      company,
    });
    expect(evil.html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(evil.html).not.toContain('<b>x</b>');
  });

  it('produces a readable plain-text alternative', () => {
    expect(text).toContain('ON-CHAIN');
    expect(text).toContain('MACRO');
    expect(text).toContain('US 10Y: 3.85 %');
    expect(text).toContain('[neutral]');
  });
});
