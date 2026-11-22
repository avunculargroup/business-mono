/**
 * Renders a market_report result into a branded HTML (+ plain-text) email. Pure
 * and side-effect free so the markup is unit-testable.
 *
 * The shell, palette and type scale are shared with the other team emails via
 * emailLayout.ts. It renders each indicator section as labelled value/change
 * rows with a neutral signal badge. Framing is deliberately factual: the figure
 * and its direction only, never a buy/sell judgement (the on-chain valuation
 * metrics are compliance-sensitive).
 */

import type { MarketReportSection } from '@platform/shared';
import {
  C,
  FONT_BODY,
  T,
  badge,
  emailShell,
  escapeHtml,
  eyebrowRow,
  footerText,
  ledeRow,
  logoRow,
  safeHref,
  titleRow,
  type CompanyFooter,
  type RenderedEmail,
} from './emailLayout.js';

export interface MarketReportEmailInput {
  /** Header eyebrow text — the routine's name/title. */
  title: string;
  sections: MarketReportSection[];
  /** When the report was produced; formatted in the recipient-facing date line. */
  date: Date;
  company: CompanyFooter;
  /** Optional findings narration rendered above the sections. */
  narration?: string | null;
  /** Absolute link to the report's web review page ("Review this report"). */
  reviewUrl?: string | null;
}

// Always rendered — the report describes market conditions, so it carries the
// general-advice warning whether or not a narration made it in.
const DISCLAIMER =
  'General information only. It is not financial advice and does not consider your objectives, financial situation or needs.';

export function renderMarketReportEmail(input: MarketReportEmailInput): RenderedEmail {
  const { sections, company } = input;
  const narration = input.narration?.trim() || null;
  const reviewUrl = input.reviewUrl && safeHref(input.reviewUrl) ? input.reviewUrl : null;

  const dateStr = new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Australia/Melbourne',
  }).format(input.date);

  const subject = `Market Report — ${dateStr}`;

  // ── Plain-text part ─────────────────────────────────────────────────────────
  const textLines: string[] = [`${company.name}`, subject, ''];
  if (narration) textLines.push(narration, '');
  for (const section of sections) {
    textLines.push(section.heading.toUpperCase(), '');
    for (const it of section.items) {
      const bits = [it.value, it.signal ? `[${it.signal}]` : '', it.delta ?? ''].filter(Boolean);
      textLines.push(`${it.label}: ${bits.join('  ')}`);
    }
    textLines.push('');
  }
  if (reviewUrl) textLines.push(`Review this report: ${reviewUrl}`, '');
  textLines.push(DISCLAIMER, '');
  textLines.push(footerText(company));
  const text = textLines.join('\n');

  // ── HTML part ───────────────────────────────────────────────────────────────
  const sectionsHtml = sections
    .map((section) => {
      const rows = section.items
        .map((it) => {
          const signalHtml = it.signal ? badge(it.signal, { marginLeft: true }) : '';
          const deltaHtml = it.delta
            ? `<div style="color:${C.textSecondary};font-size:${T.sm};line-height:1.4;margin-top:2px;">${escapeHtml(it.delta)}</div>`
            : '';
          // Tabular figures keep the right-aligned value column straight where
          // the client supports them; elsewhere it's a no-op.
          return `<tr>
            <td style="padding:10px 12px 10px 0;border-bottom:1px solid ${C.border};font-family:${FONT_BODY};font-size:${T.base};line-height:1.4;color:${C.textSecondary};vertical-align:top;">${escapeHtml(it.label)}</td>
            <td align="right" style="padding:10px 0;border-bottom:1px solid ${C.border};font-family:${FONT_BODY};vertical-align:top;white-space:nowrap;font-variant-numeric:tabular-nums;">
              <div style="font-size:${T.base};line-height:1.4;font-weight:600;color:${C.textPrimary};">${escapeHtml(it.value)}${signalHtml}</div>
              ${deltaHtml}
            </td>
          </tr>`;
        })
        .join('');
      return `<tr><td style="padding:24px 0 4px 0;">
          <div style="font-family:${FONT_BODY};font-size:${T.xs};line-height:1.4;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${C.accentDark};padding-bottom:6px;">${escapeHtml(section.heading)}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        </td></tr>`;
    })
    .join('');

  const reviewLinkHtml = reviewUrl
    ? `<tr><td style="padding:18px 0 0 0;font-family:${FONT_BODY};font-size:${T.button};line-height:1.4;">
          <a href="${escapeHtml(reviewUrl)}" style="color:${C.accentDark};text-decoration:none;font-weight:600;">Review this report →</a>
        </td></tr>`
    : '';

  const disclaimerHtml = `<tr><td style="padding:20px 0 0 0;font-family:${FONT_BODY};font-size:${T.sm};line-height:1.5;color:${C.textSecondary};">${escapeHtml(DISCLAIMER)}</td></tr>`;

  const html = emailShell({
    subject,
    preheader: narration?.split(/\n/)[0]?.trim() || `${sections.map((s) => s.heading).join(', ')} — ${dateStr}`,
    company,
    rows: `${logoRow()}
              ${eyebrowRow(input.title)}
              ${titleRow('Market Report', 2)}
              <tr><td style="font-family:${FONT_BODY};font-size:${T.sm};line-height:1.5;color:${C.textSecondary};padding-bottom:4px;">${escapeHtml(dateStr)}</td></tr>
              ${narration ? ledeRow(narration, '16px 0 4px 0') : ''}
              ${sectionsHtml}
              ${reviewLinkHtml}
              ${disclaimerHtml}`,
  });

  return { subject, html, text };
}
