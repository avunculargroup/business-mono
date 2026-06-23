/**
 * Newsletter email → news item content extraction.
 *
 * Pure helpers used by researchMailListener to turn a JMAP newsletter email
 * into the normalised fields ingestNewsItem expects: clean markdown (images,
 * scripts, styles stripped), a best-effort "view in browser" canonical URL, a
 * stable synthetic URL for the NOT NULL UNIQUE news_items.url, and sender
 * allowlist matching.
 */

import TurndownService from 'turndown';
import type { JmapEmail } from './fastmailJmap.js';

// Bound the HTML fed to Turndown — newsletters can be large and the agents host
// is memory-constrained (see fastmailJmap.stripHtml). A real body is tens of KB.
const MAX_HTML_CHARS = 500_000;

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
    // Drop newsletter chrome that carries no reading value and pollutes the feed:
    // images (stock photos + tracking pixels), styles, scripts.
    turndown.remove(['img', 'style', 'script', 'noscript']);
  }
  return turndown;
}

/**
 * Converts newsletter HTML to clean markdown: images/scripts/styles removed,
 * stray image markdown stripped, blank lines collapsed.
 */
export function htmlToMarkdown(html: string): string {
  const capped = html.length > MAX_HTML_CHARS ? html.slice(0, MAX_HTML_CHARS) : html;
  let md: string;
  try {
    md = getTurndown().turndown(capped);
  } catch {
    // Turndown can throw on pathological markup; fall back to a tag strip.
    md = capped.replace(/<[^>]+>/g, ' ');
  }
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // any image markdown that slipped through
    .replace(/[ \t]+\n/g, '\n')           // trailing whitespace
    .replace(/\n{3,}/g, '\n\n')           // collapse blank-line runs
    .trim();
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
    const href = m[1];
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
