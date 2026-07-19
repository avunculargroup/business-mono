/**
 * Renders a market_report result into a branded HTML (+ plain-text) email. Pure
 * and side-effect free so the markup is unit-testable.
 *
 * The visual language mirrors newsDigestEmail.ts (same inlined BTS palette,
 * table-based layout, logo, footer — email clients strip <style> blocks and don't
 * honour CSS custom properties or web fonts). It renders each indicator section as
 * labelled value/change rows with a neutral signal chip. Framing is deliberately
 * factual: the figure and its direction only, never a buy/sell judgement (the
 * on-chain valuation metrics are compliance-sensitive).
 */

import type { MarketReportSection } from '@platform/shared';
import type { CompanyFooter } from './newsDigestEmail.js';

// ── BTS palette (mirrors bts-design colors_and_type.css; inlined for email) ────
const C = {
  bg: '#FAFAF8',
  surface: '#FFFFFF',
  border: '#E8E6E0',
  textPrimary: '#1A1915',
  textSecondary: '#6B6860',
  textTertiary: '#9E9C96',
  accent: '#C9A84C',
  accentDark: '#9A7A2E',
} as const;

const FONT_DISPLAY = "Georgia, 'Times New Roman', serif";
const FONT_BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

// Public, auth-free brand mark (the internal app's own asset paths sit behind
// login and 403 to email image loaders). Same asset the news digest uses.
const LOGO_URL = 'https://hq.btreasury.com.au/share/55d6f441-956e-4fec-a937-d5e37fb99727';

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

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHref(url: string): string | null {
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

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
  const footerBits = [company.name, company.abn ? `ABN ${company.abn}` : '', company.website ?? ''].filter(Boolean);
  textLines.push(footerBits.join(' · '));
  const text = textLines.join('\n');

  // ── HTML part ───────────────────────────────────────────────────────────────
  const sectionsHtml = sections
    .map((section) => {
      const rows = section.items
        .map((it) => {
          const signalChip = it.signal
            ? `<span style="display:inline-block;margin-left:8px;font-family:${FONT_BODY};font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${C.accentDark};border:1px solid ${C.border};border-radius:999px;padding:1px 8px;">${escapeHtml(it.signal)}</span>`
            : '';
          const deltaHtml = it.delta
            ? `<div style="color:${C.textSecondary};font-size:12px;margin-top:2px;">${escapeHtml(it.delta)}</div>`
            : '';
          return `<tr>
            <td style="padding:10px 0;border-bottom:1px solid ${C.border};font-family:${FONT_BODY};font-size:14px;color:${C.textSecondary};vertical-align:top;">${escapeHtml(it.label)}</td>
            <td align="right" style="padding:10px 0;border-bottom:1px solid ${C.border};font-family:${FONT_BODY};vertical-align:top;">
              <div style="font-size:15px;font-weight:600;color:${C.textPrimary};">${escapeHtml(it.value)}${signalChip}</div>
              ${deltaHtml}
            </td>
          </tr>`;
        })
        .join('');
      return `<tr><td style="padding:24px 0 4px 0;">
          <div style="font-family:${FONT_BODY};font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${C.accent};padding-bottom:6px;">${escapeHtml(section.heading)}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        </td></tr>`;
    })
    .join('');

  // Findings narration — serif, sitting between the date line and the first
  // section, set off by a subtle accent rule. Paragraph breaks preserved.
  const narrationHtml = narration
    ? `<tr><td style="padding:16px 0 4px 0;">
          <div style="font-family:${FONT_DISPLAY};font-size:15px;line-height:1.55;color:${C.textPrimary};border-left:3px solid ${C.accent};padding-left:14px;">${narration
            .split(/\n{2,}/)
            .map((p) => `<p style="margin:0 0 10px 0;">${escapeHtml(p.trim())}</p>`)
            .join('')}</div>
        </td></tr>`
    : '';

  const reviewLinkHtml = reviewUrl
    ? `<tr><td style="padding:18px 0 0 0;font-family:${FONT_BODY};font-size:13px;">
          <a href="${escapeHtml(reviewUrl)}" style="color:${C.accentDark};text-decoration:none;font-weight:600;">Review this report →</a>
        </td></tr>`
    : '';

  const disclaimerHtml = `<tr><td style="padding:20px 0 0 0;font-family:${FONT_BODY};font-size:11px;line-height:1.5;color:${C.textTertiary};">${escapeHtml(DISCLAIMER)}</td></tr>`;

  const logoHref = safeHref(LOGO_URL);
  const logoHtml = logoHref
    ? `<tr><td style="padding:0 0 16px 0;"><img src="${escapeHtml(logoHref)}" alt="${escapeHtml(company.name)}" width="40" height="40" style="display:block;width:40px;height:40px;" /></td></tr>`
    : '';

  const footerLine = [
    company.abn ? `ABN ${escapeHtml(company.abn)}` : '',
    company.website && safeHref(company.website)
      ? `<a href="${escapeHtml(company.website)}" style="color:${C.accentDark};text-decoration:none;">${escapeHtml(company.website.replace(/^https?:\/\//, ''))}</a>`
      : '',
  ]
    .filter(Boolean)
    .join(' &nbsp;·&nbsp; ');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${C.surface};border:1px solid ${C.border};border-radius:12px;">
        <tr>
          <td style="padding:28px 28px 4px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${logoHtml}
              <tr>
                <td style="font-family:${FONT_BODY};font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${C.textTertiary};padding-bottom:4px;">${escapeHtml(input.title)}</td>
              </tr>
              <tr>
                <td style="font-family:${FONT_DISPLAY};font-size:22px;line-height:1.3;color:${C.textPrimary};padding-bottom:2px;">Market Report</td>
              </tr>
              <tr>
                <td style="font-family:${FONT_BODY};font-size:13px;color:${C.textSecondary};padding-bottom:4px;">${escapeHtml(dateStr)}</td>
              </tr>
              ${narrationHtml}
              ${sectionsHtml}
              ${reviewLinkHtml}
              ${disclaimerHtml}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 28px;font-family:${FONT_BODY};font-size:12px;line-height:1.5;color:${C.textTertiary};">
            <div style="font-weight:600;color:${C.textSecondary};">${escapeHtml(company.name)}</div>
            ${footerLine ? `<div style="margin-top:2px;">${footerLine}</div>` : ''}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}
