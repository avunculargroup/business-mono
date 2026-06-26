/**
 * Renders a founder's drafted social posts into a branded HTML (+ plain-text)
 * email. Pure and side-effect free so the markup is unit-testable.
 *
 * The email *imitates the post preview*, not just the text: each draft renders in
 * a card styled to its own platform (a LinkedIn-style card for the LinkedIn post,
 * an X-style card for the X post), mirroring the campaign VariantEditor's
 * platform-mimic preview (header avatar + account name + platform label, then the
 * body or a numbered X thread, then a disclaimer line). Styles are inlined and the
 * layout is table-based because email clients strip <style> blocks and don't
 * honour CSS custom properties or web fonts reliably.
 */

import type { CompanyFooter, RenderedEmail } from './newsDigestEmail.js';

// ── BTS palette (mirrors newsDigestEmail.ts; inlined for email) ────────────────
const C = {
  bg: '#FAFAF8',
  surface: '#FFFFFF',
  border: '#E8E6E0',
  textPrimary: '#1A1915',
  textSecondary: '#6B6860',
  textTertiary: '#9E9C96',
  accent: '#C9A84C',
  accentDark: '#9A7A2E',
  // X "dark chrome" so the card reads as X at a glance.
  xBg: '#15181B',
  xSurface: '#1E2226',
  xText: '#E7E9EA',
  xMuted: '#8B98A5',
} as const;

const FONT_DISPLAY = "Georgia, 'Times New Roman', serif";
const FONT_BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

type Platform = 'linkedin' | 'twitter_x';
type Classification = 'educational' | 'general_advice' | 'personal_opinion';

const PLATFORM_LABEL: Record<Platform, string> = { linkedin: 'LinkedIn', twitter_x: 'X' };

/** One drafted post to preview in the email. */
export interface SocialDraftPost {
  contentItemId: string;
  platform: Platform;
  accountName: string;
  title: string;
  body: string;
  segments: string[];
  isThread: boolean;
  classification: Classification;
  needsDisclaimer: boolean;
}

export interface SocialDraftEmailInput {
  founderName: string;
  story: { title: string; url: string; source_name: string };
  posts: SocialDraftPost[];
  /** Absolute base URL of the internal app — makes the review CTA clickable. */
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

function safeHref(url: string): string | null {
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

/** Codepoint count — closer to how platforms count than UTF-16 `.length`. */
function charCount(text: string): number {
  return Array.from(text).length;
}

/** Up to two uppercase initials from the account/display name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'BTS';
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

const COMPLIANCE_NOTE: Record<Classification, string> = {
  educational: 'Reads as education, not advice — no disclaimer.',
  general_advice: 'General advice — a disclaimer will be attached.',
  personal_opinion: 'Reads as a personal take — worth your judgement before it goes out.',
};

/** Resolve the review CTA destination for a draft, or null if not linkable. */
function reviewUrl(contentItemId: string, webAppUrl?: string): string | null {
  if (!webAppUrl) return null;
  return `${webAppUrl.replace(/\/$/, '')}/content/${contentItemId}`;
}

/** The post body as preview lines: a single block, or numbered thread segments. */
function bodyHtml(post: SocialDraftPost, dark: boolean): string {
  const color = dark ? C.xText : C.textPrimary;
  const divider = dark ? C.xSurface : C.border;
  if (post.isThread && post.segments.length > 0) {
    const numColor = dark ? C.xMuted : C.textTertiary;
    return post.segments
      .map(
        (seg, i) =>
          `<tr><td style="padding:${i === 0 ? '0' : '12px'} 0 12px 0;border-top:${
            i === 0 ? 'none' : `1px solid ${divider}`
          };font-family:${FONT_BODY};font-size:15px;line-height:1.5;color:${color};white-space:pre-wrap;"><span style="color:${numColor};font-weight:600;">${
            i + 1
          }/</span> ${escapeHtml(seg)}</td></tr>`,
      )
      .join('');
  }
  return `<tr><td style="font-family:${FONT_BODY};font-size:15px;line-height:1.55;color:${color};white-space:pre-wrap;">${escapeHtml(
    post.body,
  )}</td></tr>`;
}

/** One platform-mimic preview card. */
function cardHtml(post: SocialDraftPost, input: SocialDraftEmailInput): string {
  const dark = post.platform === 'twitter_x';
  const cardBg = dark ? C.xBg : C.surface;
  const cardBorder = dark ? C.xBg : C.border;
  const nameColor = dark ? C.xText : C.textPrimary;
  const metaColor = dark ? C.xMuted : C.textTertiary;
  const avatarBg = dark ? C.xSurface : C.bg;
  const avatarText = dark ? C.xText : C.textSecondary;

  const previewText = post.isThread ? post.segments.join('\n\n') : post.body;
  const href = reviewUrl(post.contentItemId, input.webAppUrl);
  const cta = href
    ? `<tr><td style="padding:16px 0 0 0;"><a href="${escapeHtml(
        href,
      )}" style="display:inline-block;background:${C.accent};color:#1A1915;font-family:${FONT_BODY};font-size:14px;font-weight:600;text-decoration:none;padding:10px 18px;border-radius:8px;">Review &amp; approve on the web</a></td></tr>`
    : '';

  const disclaimer = post.needsDisclaimer
    ? `<tr><td style="padding:10px 0 0 0;font-family:${FONT_BODY};font-size:12px;line-height:1.4;color:${metaColor};font-style:italic;">Disclaimer to be attached by Lex.</td></tr>`
    : '';

  return `<tr><td style="padding:0 0 20px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${cardBg};border:1px solid ${cardBorder};border-radius:16px;">
      <tr><td style="padding:18px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="44" style="vertical-align:top;">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="40" height="40" align="center" style="width:40px;height:40px;background:${avatarBg};border-radius:50%;font-family:${FONT_BODY};font-size:14px;font-weight:700;color:${avatarText};">${escapeHtml(
                initials(post.accountName),
              )}</td></tr></table>
            </td>
            <td style="vertical-align:top;padding-left:10px;">
              <div style="font-family:${FONT_BODY};font-size:15px;font-weight:600;color:${nameColor};">${escapeHtml(
                post.accountName,
              )}</div>
              <div style="font-family:${FONT_BODY};font-size:12px;color:${metaColor};">${PLATFORM_LABEL[post.platform]} · draft</div>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
          ${bodyHtml(post, dark)}
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:10px 0 0 0;font-family:${FONT_BODY};font-size:12px;color:${metaColor};">${charCount(
            previewText,
          )} characters · ${escapeHtml(COMPLIANCE_NOTE[post.classification])}</td></tr>
          ${disclaimer}
          ${cta}
        </table>
      </td></tr>
    </table>
  </td></tr>`;
}

export function renderSocialDraftEmail(input: SocialDraftEmailInput): RenderedEmail {
  const { founderName, story, posts, company } = input;
  const firstName = founderName.trim().split(/\s+/)[0] || founderName;
  const platformsList = posts.map((p) => PLATFORM_LABEL[p.platform]).join(' and ');
  const subject = `${firstName}, your ${platformsList} drafts are ready to review`;

  const storyHref = safeHref(story.url);

  // ── Plain-text part ─────────────────────────────────────────────────────────
  const textLines: string[] = [
    `Hi ${firstName},`,
    '',
    `Here ${posts.length === 1 ? 'is a draft' : `are ${posts.length} drafts`} from today's news, in your voice.`,
    '',
    `Story: ${story.title}${story.source_name ? ` (${story.source_name})` : ''}`,
    story.url,
    '',
  ];
  for (const p of posts) {
    textLines.push(`— ${PLATFORM_LABEL[p.platform]} —`);
    if (p.isThread && p.segments.length > 0) {
      p.segments.forEach((seg, i) => textLines.push(`${i + 1}/ ${seg}`));
    } else {
      textLines.push(p.body);
    }
    if (p.needsDisclaimer) textLines.push('(Disclaimer to be attached by Lex.)');
    const href = reviewUrl(p.contentItemId, input.webAppUrl);
    if (href) textLines.push(`Review: ${href}`);
    textLines.push('');
  }
  const footerBits = [company.name, company.abn ? `ABN ${company.abn}` : '', company.website ?? ''].filter(Boolean);
  textLines.push(footerBits.join(' · '));
  const text = textLines.join('\n');

  // ── HTML part ───────────────────────────────────────────────────────────────
  const storyLine = storyHref
    ? `<a href="${escapeHtml(storyHref)}" style="color:${C.accentDark};text-decoration:none;font-weight:600;">${escapeHtml(
        story.title,
      )}</a>`
    : `<span style="font-weight:600;color:${C.textPrimary};">${escapeHtml(story.title)}</span>`;

  const cards = posts.map((p) => cardHtml(p, input)).join('');

  const footerLine = [
    company.abn ? `ABN ${escapeHtml(company.abn)}` : '',
    company.website && safeHref(company.website)
      ? `<a href="${escapeHtml(company.website)}" style="color:${C.accentDark};text-decoration:none;">${escapeHtml(
          company.website.replace(/^https?:\/\//, ''),
        )}</a>`
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
              <tr><td style="font-family:${FONT_BODY};font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${C.textTertiary};padding-bottom:6px;">Social drafts for review</td></tr>
              <tr><td style="font-family:${FONT_DISPLAY};font-size:22px;line-height:1.3;color:${C.textPrimary};padding-bottom:10px;">Hi ${escapeHtml(
                firstName,
              )}, ${posts.length === 1 ? 'a draft is' : 'your drafts are'} ready</td></tr>
              <tr><td style="font-family:${FONT_BODY};font-size:14px;line-height:1.5;color:${C.textSecondary};padding-bottom:20px;">From today's news, in your voice: ${storyLine}${
                story.source_name ? ` <span style="color:${C.textTertiary};">(${escapeHtml(story.source_name)})</span>` : ''
              }. Review, tweak, and approve when you're happy.</td></tr>
              ${cards}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 28px 24px 28px;font-family:${FONT_BODY};font-size:12px;line-height:1.5;color:${C.textTertiary};">
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
