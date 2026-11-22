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

import {
  C as BTS,
  CONTENT_WIDTH,
  FONT_BODY,
  T,
  button,
  emailShell,
  escapeHtml,
  eyebrowRow,
  footerText,
  safeHref,
  titleRow,
  type CompanyFooter,
  type RenderedEmail,
} from './emailLayout.js';

// BTS palette plus X "dark chrome" so the X card reads as X at a glance.
const C = {
  ...BTS,
  xBg: '#15181B',
  xSurface: '#1E2226',
  xText: '#E7E9EA',
  xMuted: '#8B98A5',
} as const;

/** Inner width of a preview card: content column less the card's border and 20px padding. */
const CARD_CONTENT_WIDTH = CONTENT_WIDTH - 42;

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
  /**
   * This platform's marked crop of the selected image (signed URL) and its alt
   * text, when the image step succeeded. `moreOptions` counts the other
   * candidates the founder can pick from in Review.
   */
  image?: { url: string; altText: string; moreOptions?: number };
}

export interface SocialDraftEmailInput {
  founderName: string;
  story: { title: string; url: string; source_name: string };
  posts: SocialDraftPost[];
  /** Absolute base URL of the internal app — makes the review CTA clickable. */
  webAppUrl?: string;
  company: CompanyFooter;
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

/**
 * Resolve the copy-to-clipboard destination for a draft, or null if not linkable.
 * Email clients strip <script>, so the email itself can't run a copy button —
 * this links to a real page in the web app that does the clipboard write.
 */
function copyTextUrl(contentItemId: string, webAppUrl?: string): string | null {
  if (!webAppUrl) return null;
  return `${webAppUrl.replace(/\/$/, '')}/content/${contentItemId}/copy`;
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
          };font-family:${FONT_BODY};font-size:${T.base};line-height:1.5;color:${color};white-space:pre-wrap;"><span style="color:${numColor};font-weight:600;">${
            i + 1
          }/</span> ${escapeHtml(seg)}</td></tr>`,
      )
      .join('');
  }
  return `<tr><td style="font-family:${FONT_BODY};font-size:${T.base};line-height:1.55;color:${color};white-space:pre-wrap;">${escapeHtml(
    post.body,
  )}</td></tr>`;
}

/** One platform-mimic preview card. */
/**
 * The platform crop at full card width, where the image sits in a real post. If
 * the signed URL has expired or remote images are blocked, the alt text shows.
 */
/** "2 more image options to choose from in Review", or null when there are none. */
export function moreImageOptionsLine(count: number | undefined): string | null {
  if (!count || count < 1) return null;
  return `${count} more image ${count === 1 ? 'option' : 'options'} to choose from in Review`;
}

function imageHtml(post: SocialDraftPost): string {
  const src = post.image ? safeHref(post.image.url) : null;
  if (!post.image || !src) return '';
  const dark = post.platform === 'twitter_x';
  const more = moreImageOptionsLine(post.image.moreOptions);
  const moreRow = more
    ? `<tr><td style="padding:8px 0 0 0;font-family:${FONT_BODY};font-size:${T.sm};line-height:1.5;color:${dark ? C.xMuted : C.textTertiary};">${escapeHtml(more)}</td></tr>`
    : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
          <tr><td><img src="${escapeHtml(src)}" alt="${escapeHtml(
            post.image.altText,
          )}" width="${CARD_CONTENT_WIDTH}" style="display:block;width:100%;max-width:${CARD_CONTENT_WIDTH}px;height:auto;border-radius:8px;"></td></tr>
          ${moreRow}
        </table>`;
}

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
  const copyHref = copyTextUrl(post.contentItemId, input.webAppUrl);
  const cta = href
    ? `<tr><td style="padding:8px 0 0 0;">${button(href, 'Review & approve on the web')}${button(
        copyHref!,
        'Copy text',
        'secondary',
        dark ? { text: C.xMuted, border: C.xSurface } : undefined,
      )}</td></tr>`
    : '';

  const disclaimer = post.needsDisclaimer
    ? `<tr><td style="padding:10px 0 0 0;font-family:${FONT_BODY};font-size:${T.sm};line-height:1.4;color:${metaColor};font-style:italic;">Disclaimer to be attached by Lex.</td></tr>`
    : '';

  return `<tr><td style="padding:0 0 20px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${cardBg};border:1px solid ${cardBorder};border-radius:16px;">
      <tr><td style="padding:18px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="44" style="vertical-align:top;">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="40" height="40" align="center" style="width:40px;height:40px;background:${avatarBg};border-radius:50%;font-family:${FONT_BODY};font-size:${T.sm};font-weight:700;color:${avatarText};">${escapeHtml(
                initials(post.accountName),
              )}</td></tr></table>
            </td>
            <td style="vertical-align:top;padding-left:10px;">
              <div style="font-family:${FONT_BODY};font-size:${T.base};line-height:1.4;font-weight:600;color:${nameColor};">${escapeHtml(
                post.accountName,
              )}</div>
              <div style="font-family:${FONT_BODY};font-size:${T.sm};line-height:1.4;color:${metaColor};">${PLATFORM_LABEL[post.platform]} · draft</div>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
          ${bodyHtml(post, dark)}
        </table>
        ${imageHtml(post)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:10px 0 0 0;font-family:${FONT_BODY};font-size:${T.sm};line-height:1.5;color:${metaColor};">${charCount(
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
    if (p.image) {
      textLines.push(`Image: ${p.image.altText}`);
      const more = moreImageOptionsLine(p.image.moreOptions);
      if (more) textLines.push(`(${more}.)`);
    }
    if (p.needsDisclaimer) textLines.push('(Disclaimer to be attached by Lex.)');
    const href = reviewUrl(p.contentItemId, input.webAppUrl);
    if (href) textLines.push(`Review: ${href}`);
    textLines.push('');
  }
  textLines.push(footerText(company));
  const text = textLines.join('\n');

  // ── HTML part ───────────────────────────────────────────────────────────────
  const storyLine = storyHref
    ? `<a href="${escapeHtml(storyHref)}" style="color:${C.accentDark};text-decoration:none;font-weight:600;">${escapeHtml(
        story.title,
      )}</a>`
    : `<span style="font-weight:600;color:${C.textPrimary};">${escapeHtml(story.title)}</span>`;

  const cards = posts.map((p) => cardHtml(p, input)).join('');

  const html = emailShell({
    subject,
    preheader: `${posts.length === 1 ? 'A draft' : `${posts.length} drafts`} from today's news: ${story.title}`,
    company,
    rows: `${eyebrowRow('Social drafts for review')}
              ${titleRow(`Hi ${firstName}, ${posts.length === 1 ? 'a draft is' : 'your drafts are'} ready`, 10)}
              <tr><td style="font-family:${FONT_BODY};font-size:${T.base};line-height:1.5;color:${C.textSecondary};padding-bottom:20px;">From today's news, in your voice: ${storyLine}${
                story.source_name ? ` <span style="color:${C.textTertiary};">(${escapeHtml(story.source_name)})</span>` : ''
              }. Review, tweak, and approve when you're happy.</td></tr>
              ${cards}`,
  });

  return { subject, html, text };
}
