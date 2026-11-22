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

import {
  C,
  FONT_BODY,
  T,
  button,
  emailShell,
  escapeHtml,
  eyebrowRow,
  footerText,
  titleRow,
  type CompanyFooter,
  type RenderedEmail,
} from './emailLayout.js';

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
    footerText(company),
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
      return `<tr><td style="padding:10px 12px 10px 0;border-top:1px solid ${C.border};font-family:${FONT_BODY};font-size:${T.base};line-height:1.4;">${name}</td><td align="right" style="padding:10px 0;border-top:1px solid ${C.border};font-family:${FONT_BODY};font-size:${T.sm};line-height:1.4;color:${C.textSecondary};white-space:nowrap;">${rows(entry.queuedRows)}</td></tr>`;
    })
    .join('');

  const cta = queueHref
    ? `<tr><td style="padding:12px 0 0 0;">${button(queueHref, 'Open the review queue')}</td></tr>`
    : '';

  const html = emailShell({
    subject,
    preheader: `The weekly corporate research ingest left ${rows(total)} waiting for review.`,
    company,
    rows: `${eyebrowRow('Corporate research')}
              ${titleRow(`${rows(total)} to review on ${records}`, 10)}
              <tr><td style="font-family:${FONT_BODY};font-size:${T.base};line-height:1.5;color:${C.textSecondary};padding-bottom:16px;">The weekly ingest wrote new or changed rows. They are drafts, and reach no subscriber until someone approves them.</td></tr>
              <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${list}</table></td></tr>
              ${cta}`,
  });

  return { subject, html, text };
}
