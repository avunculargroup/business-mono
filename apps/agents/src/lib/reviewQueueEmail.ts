/**
 * Renders the corporate research review digest: which records a scheduled
 * ingest run left draft rows on, and how many. Pure and side-effect free so the
 * markup is unit-testable. Styles are inlined and the layout is table-based for
 * the same reasons as the news digest.
 *
 * It names records and counts rows, and nothing else: no figures from the rows
 * themselves. The rows are drafts nobody has read, and an email is the wrong
 * place for unreviewed numbers to start circulating.
 */

import type { CompanyFooter, RenderedEmail } from './newsDigestEmail.js';

// BTS palette, mirrored from newsDigestEmail.ts and inlined for email clients.
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

/** One record with draft rows waiting from this run. */
export interface ReviewQueueEntry {
  legalName: string;
  slug: string;
  queuedRows: number;
}

export interface ReviewQueueEmailInput {
  entries: ReviewQueueEntry[];
  /** Absolute base URL of the internal app; links are omitted when unset. */
  webAppUrl?: string;
  company: CompanyFooter;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function rows(n: number): string {
  return n === 1 ? '1 row' : `${n} rows`;
}

function appUrl(path: string, webAppUrl?: string): string | null {
  return webAppUrl ? `${webAppUrl.replace(/\/$/, '')}${path}` : null;
}

export function renderReviewQueueEmail(input: ReviewQueueEmailInput): RenderedEmail {
  const { entries, company } = input;
  const total = entries.reduce((sum, entry) => sum + entry.queuedRows, 0);
  const records = entries.length === 1 ? '1 record' : `${entries.length} records`;
  const subject = `Corporate research: ${rows(total)} to review on ${records}`;
  const queueHref = appUrl('/research?view=review', input.webAppUrl);

  // ── Plain-text part ──────────────────────────────────────────────────────
  const text = [
    `The weekly corporate research ingest left ${rows(total)} waiting for review.`,
    '',
    ...entries.map((entry) => {
      const href = appUrl(`/research/${entry.slug}`, input.webAppUrl);
      return `- ${entry.legalName}: ${rows(entry.queuedRows)}${href ? ` (${href})` : ''}`;
    }),
    '',
    'Draft rows reach no subscriber until someone approves them.',
    queueHref ? `Review queue: ${queueHref}` : '',
    '',
    [company.name, company.abn ? `ABN ${company.abn}` : '', company.website ?? '']
      .filter(Boolean)
      .join(' · '),
  ]
    .filter((line, index, all) => line !== '' || all[index - 1] !== '')
    .join('\n');

  // ── HTML part ────────────────────────────────────────────────────────────
  const list = entries
    .map((entry) => {
      const href = appUrl(`/research/${entry.slug}`, input.webAppUrl);
      const name = href
        ? `<a href="${escapeHtml(href)}" style="color:${C.accentDark};text-decoration:none;font-weight:600;">${escapeHtml(entry.legalName)}</a>`
        : `<span style="font-weight:600;color:${C.textPrimary};">${escapeHtml(entry.legalName)}</span>`;
      return `<tr><td style="padding:10px 0;border-top:1px solid ${C.border};font-family:${FONT_BODY};font-size:15px;line-height:1.4;">${name}</td><td align="right" style="padding:10px 0;border-top:1px solid ${C.border};font-family:${FONT_BODY};font-size:13px;color:${C.textSecondary};white-space:nowrap;">${rows(entry.queuedRows)}</td></tr>`;
    })
    .join('');

  const cta = queueHref
    ? `<tr><td style="padding:20px 0 0 0;"><a href="${escapeHtml(queueHref)}" style="display:inline-block;background:${C.accent};color:#1A1915;font-family:${FONT_BODY};font-size:14px;font-weight:600;text-decoration:none;padding:10px 18px;border-radius:8px;">Open the review queue</a></td></tr>`
    : '';

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
          <td style="padding:28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td colspan="2" style="font-family:${FONT_BODY};font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${C.textTertiary};padding-bottom:6px;">Corporate research</td></tr>
              <tr><td colspan="2" style="font-family:${FONT_DISPLAY};font-size:22px;line-height:1.3;color:${C.textPrimary};padding-bottom:10px;">${rows(total)} to review on ${records}</td></tr>
              <tr><td colspan="2" style="font-family:${FONT_BODY};font-size:14px;line-height:1.5;color:${C.textSecondary};padding-bottom:16px;">The weekly ingest wrote new or changed rows. They are drafts, and reach no subscriber until someone approves them.</td></tr>
              ${list}
              ${cta}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 24px 28px;font-family:${FONT_BODY};font-size:12px;line-height:1.5;color:${C.textTertiary};">
            <div style="font-weight:600;color:${C.textSecondary};">${escapeHtml(company.name)}</div>
            ${company.abn ? `<div style="margin-top:2px;">ABN ${escapeHtml(company.abn)}</div>` : ''}
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
