/**
 * Renders a news_curation routine result into a branded HTML (+ plain-text)
 * email. Pure and side-effect free so the markup is unit-testable.
 *
 * The visual language mirrors the dashboard's RoutineTile (headline image, mood
 * summary, ranked story list, "More news" link) using the BTS palette. Styles
 * are inlined and the layout is table-based because email clients strip <style>
 * blocks and don't honour CSS custom properties or web fonts reliably.
 */

import type { NewsCurationStory, RoutineResult } from '@platform/shared';

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

// Email clients can't load Google fonts, so fall back to durable system stacks
// (serif for the display heading, sans for body) that echo the brand pairing.
const FONT_DISPLAY = "Georgia, 'Times New Roman', serif";
const FONT_BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export interface CompanyFooter {
  /** Trading name, e.g. "Bitcoin Treasury Solutions". */
  name: string;
  /** Public website URL, e.g. "https://www.bitcointreasurysolutions.com.au". */
  website?: string;
  /** Australian Business Number (digits only or formatted). */
  abn?: string;
}

export interface NewsDigestEmailInput {
  /** Routine title used in the header eyebrow (e.g. dashboard_title or name). */
  title: string;
  /** Recipient-facing greeting line, e.g. "Morning Chris,". Omitted when empty. */
  greeting?: string;
  result: RoutineResult;
  /** When the digest was produced; formatted in the recipient-facing date line. */
  date: Date;
  /** Absolute base URL of the internal app, used to make the "More news" link clickable in email. */
  webAppUrl?: string;
  company: CompanyFooter;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** One normalised line item for the email body. */
interface DigestItem {
  title: string;
  url: string;
  source: string;
}

/**
 * Strips a trailing " - / | / – / — <Publication>" source suffix from a headline.
 * Mirrors apps/web/lib/news/cleanTitle.ts (not importable from agents) so the
 * email reads the same as the dashboard tile.
 */
const SOURCE_SUFFIX = /\s+[-–—|]\s+([^-–—|]{1,60})$/;
function cleanTitle(title: string): string {
  let current = title.trim();
  for (;;) {
    const match = SOURCE_SUFFIX.exec(current);
    if (!match) break;
    const suffix = match[1]!.trim();
    if (suffix.split(/\s+/).length > 6) break;
    if (/[.!?]$/.test(suffix)) break;
    const stripped = current.slice(0, match.index).trim();
    if (stripped.length < 3) break;
    current = stripped;
  }
  return current;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only allow http(s) links into the markup; everything else renders as plain text. */
function safeHref(url: string): string | null {
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

function digestItems(result: RoutineResult): DigestItem[] {
  const meta = (result.metadata ?? {}) as { stories?: NewsCurationStory[] };
  if (meta.stories && meta.stories.length > 0) {
    return meta.stories.map((s) => ({
      title: cleanTitle(s.title),
      url: s.url,
      source: s.source_name,
    }));
  }
  // Fall back to the action-agnostic sources[] the tile also reads from.
  return (result.sources ?? []).map((s) => ({
    title: cleanTitle(s.title ?? s.url),
    url: s.url,
    source: s.source ?? '',
  }));
}

/** Resolve the "More news" destination to an absolute URL, or null if not linkable in email. */
function resolveMoreNewsUrl(result: RoutineResult, webAppUrl?: string): string | null {
  const raw = (result.metadata as { more_news_url?: string } | undefined)?.more_news_url;
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (webAppUrl && raw.startsWith('/')) return webAppUrl.replace(/\/$/, '') + raw;
  return null; // relative path with no base — can't be clicked from an inbox
}

/**
 * Public URL of the BTS brand mark shown as the email header avatar.
 * Must stay publicly reachable (no auth) so email clients can load it — the
 * internal app's own asset paths sit behind login and 403 to image loaders.
 */
const LOGO_URL = 'https://hq.btreasury.com.au/share/55d6f441-956e-4fec-a937-d5e37fb99727';

export function renderNewsDigestEmail(input: NewsDigestEmailInput): RenderedEmail {
  const { result, company } = input;
  const meta = (result.metadata ?? {}) as { mood_summary?: string; headline_image_url?: string };
  const mood = meta.mood_summary?.trim() || result.summary?.trim() || '';
  const headlineImage = meta.headline_image_url;
  const items = digestItems(result);
  const moreNewsUrl = resolveMoreNewsUrl(result, input.webAppUrl);

  const dateStr = new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Australia/Melbourne',
  }).format(input.date);

  const subject = `Daily Digest - ${dateStr}`;

  // ── Plain-text part ─────────────────────────────────────────────────────────
  const greeting = input.greeting?.trim() || '';
  const textLines: string[] = [`${company.name}`, dateStr, ''];
  if (greeting) textLines.push(greeting, '');
  if (mood) textLines.push(mood, '');
  items.forEach((it, i) => {
    textLines.push(`${i + 1}. ${it.title}${it.source ? ` (${it.source})` : ''}`);
    textLines.push(`   ${it.url}`);
  });
  if (moreNewsUrl) textLines.push('', `More news: ${moreNewsUrl}`);
  const footerBits = [company.name, company.abn ? `ABN ${company.abn}` : '', company.website ?? ''].filter(Boolean);
  textLines.push('', footerBits.join(' · '));
  const text = textLines.join('\n');

  // ── HTML part ───────────────────────────────────────────────────────────────
  const storyRows = items
    .map((it) => {
      const href = safeHref(it.url);
      const titleHtml = escapeHtml(it.title);
      const linked = href
        ? `<a href="${escapeHtml(href)}" style="color:${C.textPrimary};text-decoration:none;font-weight:600;">${titleHtml}</a>`
        : `<span style="color:${C.textPrimary};font-weight:600;">${titleHtml}</span>`;
      const sourceHtml = it.source
        ? `<div style="color:${C.textTertiary};font-size:12px;margin-top:2px;">${escapeHtml(it.source)}</div>`
        : '';
      return `<tr><td style="padding:0 0 16px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.5;">${linked}${sourceHtml}</td></tr>`;
    })
    .join('');

  // When no story yields a usable image, render a branded "Daily News" banner so
  // the digest never opens with a blank space. Pure markup (no external asset)
  // keeps it reliable across email clients and lets us show the live date.
  const fallbackBannerHtml = `<tr><td style="padding:0 0 20px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.textPrimary};border-radius:12px;">
          <tr><td style="padding:36px 28px;border-left:4px solid ${C.accent};border-radius:12px;">
            <div style="font-family:${FONT_BODY};font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${C.accent};">Daily News</div>
            <div style="font-family:${FONT_DISPLAY};font-size:24px;line-height:1.3;color:${C.surface};margin-top:6px;">${escapeHtml(dateStr)}</div>
          </td></tr>
        </table>
      </td></tr>`;

  const headlineImageHtml = headlineImage && safeHref(headlineImage)
    ? `<tr><td style="padding:0 0 20px 0;"><img src="${escapeHtml(headlineImage)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border-radius:12px;" /></td></tr>`
    : fallbackBannerHtml;

  const greetingHtml = greeting
    ? `<tr><td style="padding:0 0 12px 0;font-family:${FONT_BODY};font-size:16px;line-height:1.5;color:${C.textPrimary};">${escapeHtml(greeting)}</td></tr>`
    : '';

  const moodHtml = mood
    ? `<tr><td style="padding:0 0 20px 0;font-family:${FONT_DISPLAY};font-size:20px;line-height:1.4;color:${C.textPrimary};">${escapeHtml(mood)}</td></tr>`
    : '';

  const logoHtml = `<tr><td style="padding:0 0 16px 0;"><img src="${escapeHtml(LOGO_URL)}" alt="${escapeHtml(company.name)}" width="40" height="40" style="display:block;width:40px;height:40px;" /></td></tr>`;

  const moreNewsHtml = moreNewsUrl
    ? `<tr><td style="padding:20px 0 0 0;border-top:1px solid ${C.border};">
         <a href="${escapeHtml(moreNewsUrl)}" style="display:inline-block;background:${C.accent};color:#1A1915;font-family:${FONT_BODY};font-size:14px;font-weight:600;text-decoration:none;padding:10px 18px;border-radius:8px;">Read more news</a>
       </td></tr>`
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
          <td style="padding:28px 28px 0 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${logoHtml}
              <tr>
                <td style="font-family:${FONT_BODY};font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${C.textTertiary};padding-bottom:4px;">${escapeHtml(input.title)}</td>
              </tr>
              <tr>
                <td style="font-family:${FONT_BODY};font-size:13px;color:${C.textSecondary};padding-bottom:20px;">${escapeHtml(dateStr)}</td>
              </tr>
              ${headlineImageHtml}
              ${greetingHtml}
              ${moodHtml}
              ${storyRows}
              ${moreNewsHtml}
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
