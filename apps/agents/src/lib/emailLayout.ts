/**
 * Shared building blocks for the branded team emails (news digest, market
 * report, social drafts, research review queue): palette, type scale, escaping,
 * and the outer card + footer every one of them sits in.
 *
 * Styles are inlined and the layout is table-based because email clients strip
 * <style> blocks and don't honour CSS custom properties or web fonts reliably.
 */

// ── BTS palette (mirrors bts-design colors_and_type.css; inlined for email) ────
export const C = {
  bg: '#FAFAF8',
  surface: '#FFFFFF',
  border: '#E8E6E0',
  textPrimary: '#1A1915',
  textSecondary: '#6B6860',
  textTertiary: '#9E9C96',
  surfaceSubtle: '#F4F4F1',
  accent: '#C9A84C',
  accentDark: '#9A7A2E',
} as const;

/**
 * The bts-design type scale (--text-xs … --text-xl), plus the 14px the app's
 * default Button uses. Every font-size in the emails comes from here.
 */
export const T = {
  xs: '11px', // uppercase eyebrows, badges
  sm: '13px', // meta lines, footer, disclaimer
  button: '14px',
  base: '15px', // body
  md: '16px', // lede / narration
  lg: '20px', // email title
  xl: '28px', // hero banner
} as const;

// Email clients can't load Google fonts, so fall back to durable system stacks
// (serif for the display heading, sans for body) that echo the brand pairing.
export const FONT_DISPLAY = "Georgia, 'Times New Roman', serif";
export const FONT_BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

/**
 * Width of the content column: the 600px card less 28px padding each side.
 * Images take this as their width attribute — Outlook sizes by the attribute
 * and ignores max-width, so 600 would spill out of the card.
 */
export const CONTENT_WIDTH = 544;

/**
 * Public URL of the BTS brand mark shown as the email header avatar.
 * Must stay publicly reachable (no auth) so email clients can load it — the
 * internal app's own asset paths sit behind login and 403 to image loaders.
 */
export const LOGO_URL = 'https://hq.btreasury.com.au/share/55d6f441-956e-4fec-a937-d5e37fb99727';

export interface CompanyFooter {
  /** Trading name, e.g. "Bitcoin Treasury Solutions". */
  name: string;
  /** Public website URL, e.g. "https://www.bitcointreasurysolutions.com.au". */
  website?: string;
  /** Australian Business Number (digits only or formatted). */
  abn?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only allow http(s) links into the markup; everything else renders as plain text. */
export function safeHref(url: string): string | null {
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

/** "Name · ABN … · website" for the plain-text part. */
export function footerText(company: CompanyFooter): string {
  return [company.name, company.abn ? `ABN ${company.abn}` : '', company.website ?? '']
    .filter(Boolean)
    .join(' · ');
}

/** Small uppercase label above the title. */
export function eyebrowRow(label: string): string {
  return `<tr><td style="font-family:${FONT_BODY};font-size:${T.xs};line-height:1.4;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${C.textTertiary};padding-bottom:4px;">${escapeHtml(label)}</td></tr>`;
}

/** The serif email title. */
export function titleRow(title: string, paddingBottom = 4): string {
  return `<tr><td style="font-family:${FONT_DISPLAY};font-size:${T.lg};line-height:1.3;color:${C.textPrimary};padding-bottom:${paddingBottom}px;">${escapeHtml(title)}</td></tr>`;
}

/**
 * Header avatar. The alt text is short and styled because Outlook blocks images
 * by default, and the full company name squeezed into 40×40 reads as garbage.
 */
export function logoRow(): string {
  return `<tr><td style="padding:0 0 16px 0;"><img src="${escapeHtml(LOGO_URL)}" alt="BTS" width="40" height="40" style="display:block;width:40px;height:40px;font-family:${FONT_BODY};font-size:${T.xs};font-weight:700;line-height:40px;text-align:center;color:${C.textSecondary};background:${C.surfaceSubtle};border-radius:8px;" /></td></tr>`;
}

/**
 * The serif lede (digest mood line, market narration), set off by an accent
 * rule. Blank-line-separated paragraphs are kept.
 */
export function ledeRow(text: string, padding = '0 0 20px 0'): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return `<tr><td style="padding:${padding};">
          <div style="font-family:${FONT_DISPLAY};font-size:${T.md};line-height:1.55;color:${C.textPrimary};border-left:3px solid ${C.accent};padding-left:14px;">${paragraphs
            .map((p, i) => `<p style="margin:0${i < paragraphs.length - 1 ? ' 0 10px 0' : ''};">${escapeHtml(p)}</p>`)
            .join('')}</div>
        </td></tr>`;
}

/**
 * Status badge: the 4px radius and neutral tones of StatusChip in @platform/ui,
 * inlined. Not a pill.
 */
export function badge(label: string, opts: { marginLeft?: boolean; dark?: { bg: string; text: string } } = {}): string {
  const bg = opts.dark?.bg ?? C.surfaceSubtle;
  const color = opts.dark?.text ?? C.textSecondary;
  return `<span style="display:inline-block;background:${bg};color:${color};font-family:${FONT_BODY};font-size:${T.xs};font-weight:600;line-height:1.4;padding:1px 6px;border-radius:4px;vertical-align:middle;${opts.marginLeft ? 'margin-left:8px;' : ''}">${escapeHtml(label)}</span>`;
}

/**
 * A link styled as a button. The right/top margin (not a left one) keeps a
 * second button flush left with an 8px gap when a narrow screen wraps it onto
 * its own line.
 */
export function button(
  href: string,
  label: string,
  variant: 'primary' | 'secondary' = 'primary',
  secondaryColors: { text: string; border: string } = { text: C.textSecondary, border: C.border },
): string {
  const look =
    variant === 'primary'
      ? `background:${C.accent};color:${C.textPrimary};border:1px solid ${C.accent};`
      : `background:transparent;color:${secondaryColors.text};border:1px solid ${secondaryColors.border};`;
  return `<a href="${escapeHtml(href)}" style="display:inline-block;margin:8px 8px 0 0;${look}font-family:${FONT_BODY};font-size:${T.button};line-height:1.4;font-weight:600;text-decoration:none;padding:10px 18px;border-radius:8px;">${escapeHtml(label)}</a>`;
}

/**
 * Hidden inbox preview line. The trailing zero-width filler stops clients
 * padding the preview with the first visible text in the body.
 */
function preheaderHtml(text: string): string {
  const filler = '&#847;&zwnj;&nbsp;'.repeat(40);
  return `<div style="display:none;max-height:0;max-width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.bg};opacity:0;">${escapeHtml(text)}${filler}</div>`;
}

function footerHtml(company: CompanyFooter): string {
  const line = [
    company.abn ? `ABN ${escapeHtml(company.abn)}` : '',
    company.website && safeHref(company.website)
      ? `<a href="${escapeHtml(company.website)}" style="color:${C.accentDark};text-decoration:none;">${escapeHtml(
          company.website.replace(/^https?:\/\//, ''),
        )}</a>`
      : '',
  ]
    .filter(Boolean)
    .join(' &nbsp;·&nbsp; ');
  return `<tr>
          <td style="padding:24px 28px;font-family:${FONT_BODY};font-size:${T.sm};line-height:1.5;color:${C.textTertiary};">
            <div style="font-weight:600;color:${C.textSecondary};">${escapeHtml(company.name)}</div>
            ${line ? `<div style="margin-top:2px;">${line}</div>` : ''}
          </td>
        </tr>`;
}

export interface ShellInput {
  /** Document <title>; normally the email subject. */
  subject: string;
  /** One line shown after the subject in the inbox list. */
  preheader: string;
  /** Content rows (`<tr>…</tr>`) for the single-column body table. */
  rows: string;
  company: CompanyFooter;
}

/** The full HTML document: page background, 600px card, content rows, footer. */
export function emailShell(input: ShellInput): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(input.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
${preheaderHtml(input.preheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${C.surface};border:1px solid ${C.border};border-radius:12px;">
        <tr>
          <td style="padding:28px 28px 0 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${input.rows}
            </table>
          </td>
        </tr>
        ${footerHtml(input.company)}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
