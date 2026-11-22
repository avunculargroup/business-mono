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
import {
  C,
  CONTENT_WIDTH,
  FONT_BODY,
  FONT_DISPLAY,
  T,
  badge,
  button,
  emailShell,
  escapeHtml,
  eyebrowRow,
  footerText,
  ledeRow,
  logoRow,
  safeHref,
  type CompanyFooter,
  type RenderedEmail,
} from './emailLayout.js';

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

/** One normalised line item for the email body. */
interface DigestItem {
  title: string;
  url: string;
  source: string;
  /** news_items / podcast id, for the in-app fallback link. */
  id?: string;
  kind?: 'news' | 'podcast';
  paywalled?: boolean;
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

/** Badge text for a story whose article sits behind a paywall. */
const PAYWALL_LABEL = 'Paywall';

/**
 * Where a story's headline should point. Email-sourced items carry a synthetic
 * `email://…` url that opens nothing, so those fall back to the in-app reading
 * view. Null when neither is available — the caller renders unlinked text.
 */
function storyHref(item: DigestItem, webAppUrl?: string): string | null {
  const external = safeHref(item.url);
  if (external) return external;
  if (!item.id || !webAppUrl) return null;
  const base = webAppUrl.replace(/\/$/, '');
  return item.kind === 'podcast'
    ? `${base}/news/podcasts/${item.id}`
    : `${base}/news/${item.id}`;
}

function digestItems(result: RoutineResult): DigestItem[] {
  const meta = (result.metadata ?? {}) as { stories?: NewsCurationStory[] };
  if (meta.stories && meta.stories.length > 0) {
    return meta.stories.map((s) => ({
      title: cleanTitle(s.title),
      url: s.url,
      source: s.source_name,
      id: s.id,
      kind: s.kind,
      paywalled: s.paywalled,
    }));
  }
  // Fall back to the action-agnostic sources[] the tile also reads from.
  return (result.sources ?? []).map((s) => ({
    title: cleanTitle(s.title ?? s.url),
    url: s.url,
    source: s.source ?? '',
    paywalled: s.paywalled,
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
    textLines.push(`${i + 1}. ${it.title}${it.source ? ` (${it.source})` : ''}${it.paywalled ? ` [${PAYWALL_LABEL}]` : ''}`);
    const href = storyHref(it, input.webAppUrl);
    if (href) textLines.push(`   ${href}`);
  });
  if (moreNewsUrl) textLines.push('', `More news: ${moreNewsUrl}`);
  textLines.push('', footerText(company));
  const text = textLines.join('\n');

  // ── HTML part ───────────────────────────────────────────────────────────────
  const storyRows = items
    .map((it) => {
      const href = storyHref(it, input.webAppUrl);
      const titleHtml = escapeHtml(it.title);
      const linked = href
        ? `<a href="${escapeHtml(href)}" style="color:${C.textPrimary};text-decoration:none;font-weight:600;">${titleHtml}</a>`
        : `<span style="color:${C.textPrimary};font-weight:600;">${titleHtml}</span>`;
      const paywallHtml = it.paywalled ? badge(PAYWALL_LABEL, { marginLeft: Boolean(it.source) }) : '';
      const sourceHtml = it.source || paywallHtml
        ? `<div style="color:${C.textTertiary};font-size:${T.sm};line-height:1.5;margin-top:2px;">${it.source ? escapeHtml(it.source) : ''}${paywallHtml}</div>`
        : '';
      return `<tr><td style="padding:0 0 16px 0;font-family:${FONT_BODY};font-size:${T.base};line-height:1.5;">${linked}${sourceHtml}</td></tr>`;
    })
    .join('');

  // When no story yields a usable image, render a branded "Daily News" banner so
  // the digest never opens with a blank space. Pure markup (no external asset)
  // keeps it reliable across email clients and lets us show the live date.
  const fallbackBannerHtml = `<tr><td style="padding:0 0 20px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.textPrimary};border-radius:12px;">
          <tr><td style="padding:36px 28px;border-left:4px solid ${C.accent};border-radius:12px;">
            <div style="font-family:${FONT_BODY};font-size:${T.xs};line-height:1.4;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${C.accent};">Daily News</div>
            <div style="font-family:${FONT_DISPLAY};font-size:${T.xl};line-height:1.25;color:${C.surface};margin-top:6px;">${escapeHtml(dateStr)}</div>
          </td></tr>
        </table>
      </td></tr>`;

  const hasHeadlineImage = Boolean(headlineImage && safeHref(headlineImage));
  const headlineImageHtml = hasHeadlineImage
    ? `<tr><td style="padding:0 0 20px 0;"><img src="${escapeHtml(headlineImage!)}" alt="" width="${CONTENT_WIDTH}" style="display:block;width:100%;max-width:${CONTENT_WIDTH}px;height:auto;border-radius:12px;" /></td></tr>`
    : fallbackBannerHtml;

  // The fallback banner already carries the date; only the image needs a date line.
  const dateHtml = hasHeadlineImage
    ? `<tr><td style="font-family:${FONT_BODY};font-size:${T.sm};line-height:1.5;color:${C.textSecondary};padding-bottom:20px;">${escapeHtml(dateStr)}</td></tr>`
    : `<tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>`;

  const greetingHtml = greeting
    ? `<tr><td style="padding:0 0 10px 0;font-family:${FONT_BODY};font-size:${T.base};line-height:1.5;color:${C.textSecondary};">${escapeHtml(greeting)}</td></tr>`
    : '';

  const moodHtml = mood ? ledeRow(mood) : '';

  const moreNewsHtml = moreNewsUrl
    ? `<tr><td style="padding:12px 0 0 0;border-top:1px solid ${C.border};">${button(moreNewsUrl, 'Read more news')}</td></tr>`
    : '';

  const html = emailShell({
    subject,
    preheader: mood || items[0]?.title || dateStr,
    company,
    rows: `${logoRow()}
              ${eyebrowRow(input.title)}
              ${dateHtml}
              ${headlineImageHtml}
              ${greetingHtml}
              ${moodHtml}
              ${storyRows}
              ${moreNewsHtml}`,
  });

  return { subject, html, text };
}
