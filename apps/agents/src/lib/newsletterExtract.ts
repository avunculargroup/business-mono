/**
 * Newsletter email → news item content extraction.
 *
 * Pure helpers used by researchMailListener to turn a JMAP newsletter email
 * into the normalised fields ingestNewsItem expects: clean markdown, a
 * best-effort "view in browser" canonical URL, a stable synthetic URL for the
 * NOT NULL UNIQUE news_items.url, and sender allowlist matching.
 *
 * htmlToMarkdown is three stages: cleanEmailHtml (emailClean.ts) strips the
 * template on the DOM, Turndown + GFM converts, normaliseMarkdown tidies what
 * conversion leaves. See docs/news-source-email-extraction-spec.md.
 */

import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import type { JmapEmail } from './fastmailJmap.js';
import { cleanEmailHtml, INVISIBLE_CHARS_RE, type CleanRule } from './emailClean.js';
import { createLogger } from './logger.js';

const log = createLogger('newsletter-extract');

// Bound the HTML fed to Turndown — newsletters can be large and the agents host
// is memory-constrained (see fastmailJmap.stripHtml). A real body is tens of KB.
export const MAX_HTML_CHARS = 500_000;

/**
 * Version of the extractor that produced a body, stored on news_item_raw so a
 * re-run can find bodies an older cleaner wrote. Bump on any rule change.
 */
export const EMAIL_EXTRACTOR_VERSION = 'email-2026.10.1';

/** Raw HTML body of an email, or null when there is no usable HTML part. */
export function getHtmlBody(email: JmapEmail): string | null {
  for (const part of email.htmlBody) {
    const val = email.bodyValues[part.partId]?.value;
    if (val && val.trim()) return val;
  }
  return null;
}

let turndown: TurndownService | null = null;
function getTurndown(): TurndownService {
  if (!turndown) {
    turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    // Tables and strikethrough. Layout tables are already unwrapped by
    // cleanEmailHtml, so what reaches here is data.
    turndown.use(gfm);
    // Drop newsletter chrome that carries no reading value and pollutes the feed:
    // images (stock photos + tracking pixels), styles, scripts.
    turndown.remove(['img', 'style', 'script', 'noscript']);
  }
  return turndown;
}

/**
 * Tag strip used when Turndown fails. Style and script bodies are cut first —
 * `<[^>]+>` only removes the tags, so without this the email's CSS survives as
 * body text (a whole month of newsletters landed that way when Turndown was
 * broken by the bundler). Entity decoding matches fastmailJmap.stripHtml.
 */
function stripToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/** Lowercase letters and digits only — for comparing a line with the subject. */
function comparable(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Stage 3: tidies any body before it reaches ingestNewsItem — converted email
 * HTML, the plain-text fallback, and Jina output from followed links.
 *
 *  1. invisible preheader characters out, non-breaking spaces to spaces
 *  2. empty links and image markdown out
 *  3. escaping that changes nothing in rendering undone (`\-` mid-line,
 *     `\.` after a non-digit)
 *  4. the first line dropped when it only repeats the subject
 *  5. repeated lines collapsed, then blank-line runs
 */
export function normaliseMarkdown(md: string, opts: { subject?: string } = {}): string {
  let out = md
    .replace(INVISIBLE_CHARS_RE, '')
    .replace(/\u00a0/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\s*\]\([^)]*\)/g, '')
    .replace(/(?<!^[ \t]*)\\-/gm, '-')
    .replace(/(?<!\d)\\\./g, '.')
    .replace(/[ \t]+$/gm, '');

  const lines = out.split('\n');
  if (opts.subject) {
    const subject = comparable(opts.subject);
    const first = lines.findIndex((l) => l.trim() !== '');
    if (subject && first !== -1 && comparable(lines[first]!.replace(/^#+\s*/, '')) === subject) {
      lines.splice(first, 1);
    }
  }

  // Identical lines, even with blank lines between them, are template echoes
  // ("View in browser" twice, a repeated divider) — never prose.
  const kept: string[] = [];
  let lastText: string | null = null;
  for (const line of lines) {
    if (line.trim() === '') {
      kept.push(line);
      continue;
    }
    if (line === lastText) continue;
    kept.push(line);
    lastText = line;
  }

  out = kept.join('\n').replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

/**
 * Converts newsletter HTML to clean markdown: template stripped on the DOM,
 * converted with GFM, then normalised. The CleanReport is logged once per
 * email so the rules can be tuned from real mail.
 */
export function htmlToMarkdown(
  html: string,
  opts: { subject?: string; disableRules?: readonly CleanRule[] } = {},
): string {
  const capped = html.length > MAX_HTML_CHARS ? html.slice(0, MAX_HTML_CHARS) : html;

  let cleaned = capped;
  try {
    const result = cleanEmailHtml(capped, { disable: opts.disableRules });
    cleaned = result.html;
    log.info({ removed: result.removed }, 'email html cleaned');
  } catch (err) {
    // The cleaner is an improvement, not a dependency: convert the raw HTML
    // rather than lose the issue.
    log.warn({ err, chars: capped.length }, 'email clean failed — converting raw html');
  }

  let md: string;
  try {
    md = getTurndown().turndown(cleaned);
  } catch (err) {
    // Turndown can throw on pathological markup; fall back to a tag strip. Logged
    // because a systemic failure here is otherwise invisible — the feed just
    // quietly degrades to plain text.
    log.warn({ err, chars: cleaned.length }, 'turndown failed — falling back to tag strip');
    md = stripToText(cleaned);
  }
  return normaliseMarkdown(md, { subject: opts.subject });
}

/**
 * Best-effort canonical "view in browser" / "view online" link from the raw
 * HTML — the publisher's hosted copy of the issue. Null when none is found.
 */
export function extractCanonicalUrl(html: string): string | null {
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const labelRe = /view\s+(this\s+)?(email\s+)?(in\s+)?(your\s+)?browser|view\s+online|read\s+online|view\s+in\s+browser/i;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    // Entity-escaped in email HTML, as in newsletterLinks.extractNewsletterLinks.
    const href = m[1].replace(/&amp;/gi, '&');
    const text = m[2].replace(/<[^>]+>/g, ' ').trim();
    if (labelRe.test(text) && /^https?:\/\//i.test(href)) return href;
  }
  return null;
}

/**
 * Stable synthetic URL for news_items.url (NOT NULL UNIQUE) when an email has no
 * canonical link. Keyed by source slug + Message-ID so re-delivery maps to the
 * same row and dedup is exact.
 */
export function synthesizeEmailUrl(slug: string, key: string): string {
  return `email://${slug}/${encodeURIComponent(key)}`;
}

/**
 * Whether `fromEmail` is approved for a source. An empty allowlist returns true
 * (the first-email onboarding case — the UI then offers "Trust this sender").
 * Allowlist entries containing '@' match the full address; others match the
 * sender's domain.
 */
export function senderAllowed(fromEmail: string, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) return true;
  const email = fromEmail.trim().toLowerCase();
  const domain = email.split('@')[1] ?? '';
  for (const raw of allowlist) {
    const entry = raw.trim().toLowerCase();
    if (!entry) continue;
    if (entry.includes('@')) {
      if (entry === email) return true;
    } else if (entry === domain) {
      return true;
    }
  }
  return false;
}
