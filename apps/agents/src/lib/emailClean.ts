/**
 * Email HTML → content-only HTML, before Turndown sees it.
 *
 * Turndown reads tags, not inline styles, so everything an email client hides
 * (preheaders, mobile duplicates) and much of what a template adds around the
 * issue (image-only anchors, unsubscribe footers, layout tables, tracking
 * wrappers) used to land in news_items as body text. This stage removes it on
 * the DOM, where structure still says what is chrome.
 *
 * Deterministic by design — no LLM (see the Workflow-vs-Agent rule in
 * CLAUDE.md). Every rule counts what it removed in CleanReport, logged once
 * per email so the rules can be tuned from real mail. Spec:
 * docs/news-source-email-extraction-spec.md, "Stage 1 — DOM clean".
 */

import * as cheerio from 'cheerio';
import type { Cheerio, CheerioAPI } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import { isSubscriberScoped } from '@platform/shared';
import { DENY_ANCHOR_RE, stripTrackingParams, unwrapOffline } from './urlClean.js';

/**
 * The rules, in the order they run. The spec's seventh, removing containers
 * left empty, is not here: Turndown's blank-element rule already drops them,
 * and the fixture coverage test showed no output changed with it switched off.
 */
export const CLEAN_RULES = [
  'hidden',
  'imageAnchors',
  'chromeAnchors',
  'footer',
  'layoutTables',
  'links',
] as const;
export type CleanRule = (typeof CLEAN_RULES)[number];

export interface CleanReport {
  hidden: number;
  imageAnchors: number;
  chromeAnchors: number;
  /** Elements removed by the footer cut (the block plus its following siblings). */
  footer: number;
  /** Set when a footer was found but the cut would have taken over 25% of the text. */
  footerGuarded: boolean;
  layoutTables: number;
  /** Links rewritten to a decoded or de-tracked URL. */
  linksCleaned: number;
  /** Links reduced to their text because no clean URL could be had offline. */
  linksTextOnly: number;
}

/** Characters email templates use as invisible preheader padding. */
export const INVISIBLE_CHARS_RE = /[͏­​-‍⁠﻿ ]/g;

// Unambiguous: nothing visible is ever styled this way.
const HIDDEN_STYLE_RE = /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden|mso-hide\s*:\s*all)\b/i;
// Ambiguous: font-size:0 also wraps inline-block columns to kill whitespace
// gaps, with each column restoring its own size. Only short elements go.
const COLLAPSED_STYLE_RE = /(?:^|;)\s*(?:max-height\s*:\s*0(?:px)?|opacity\s*:\s*0(?:\.0+)?|font-size\s*:\s*0(?:px)?)\s*(?:!important)?\s*(?:;|$)/i;
const COLLAPSED_MAX_TEXT = 300;
const HIDDEN_CLASS_RE = /(?:^|\s)(?:preheader|preview-text)(?:\s|$)/i;

const FOOTER_MARKER_RE = /unsubscribe|manage (?:your )?(?:email )?preferences/i;
const FOOTER_BLOCKS = new Set(['td', 'table', 'div', 'p']);
const FOOTER_MAX_BLOCK_TEXT = 600;
const FOOTER_MAX_SHARE = 0.25;

const BLOCK_TAGS = 'div, p, table, h1, h2, h3, h4, h5, h6, ul, ol, blockquote';

function visibleText($el: Cheerio<AnyNode>): string {
  return $el.text().replace(INVISIBLE_CHARS_RE, '').replace(/\s+/g, ' ').trim();
}

function emptyReport(): CleanReport {
  return {
    hidden: 0,
    imageAnchors: 0,
    chromeAnchors: 0,
    footer: 0,
    footerGuarded: false,
    layoutTables: 0,
    linksCleaned: 0,
    linksTextOnly: 0,
  };
}

/** Rule 1 — hidden elements. */
function removeHidden($: CheerioAPI, report: CleanReport): void {
  $('[style], [class], [hidden]').each((_, el) => {
    const $el = $(el);
    const style = $el.attr('style') ?? '';
    const hidden =
      $el.attr('hidden') !== undefined ||
      HIDDEN_STYLE_RE.test(style) ||
      HIDDEN_CLASS_RE.test($el.attr('class') ?? '') ||
      (COLLAPSED_STYLE_RE.test(style) && visibleText($el).length <= COLLAPSED_MAX_TEXT);
    if (hidden) {
      $el.remove();
      report.hidden += 1;
    }
  });
}

/** Rule 2 — anchors that wrapped only an image (sponsor banners, header art). */
function removeImageAnchors($: CheerioAPI, report: CleanReport): void {
  $('a').each((_, el) => {
    const $el = $(el);
    if (!visibleText($el)) {
      $el.remove();
      report.imageAnchors += 1;
    }
  });
}

/**
 * Locates the footer before rule 3 removes the "Unsubscribe" anchor that
 * marks it: the last element whose href or own text mentions unsubscribe or
 * preferences, walked up to the outermost block ancestor that is still under
 * 600 characters of text and under the 25% share. The share bound matters in
 * a short email, where the whole issue can be under 600 characters.
 */
function findFooterBlock($: CheerioAPI): Element | null {
  let marker: Element | null = null;
  $('body *').each((_, el) => {
    const $el = $(el);
    const ownText = $el.contents().filter((__, n) => n.type === 'text').text();
    if (FOOTER_MARKER_RE.test($el.attr('href') ?? '') || FOOTER_MARKER_RE.test(ownText)) marker = el;
  });
  if (!marker) return null;

  const total = visibleText($('body')).length;
  let block: Element | null = null;
  for (const ancestor of [marker as Element, ...$(marker).parents().toArray()]) {
    if (!FOOTER_BLOCKS.has(ancestor.tagName)) continue;
    const chars = visibleText($(ancestor)).length;
    if (chars >= FOOTER_MAX_BLOCK_TEXT || (total > 0 && chars / total > FOOTER_MAX_SHARE)) break;
    block = ancestor;
  }
  return block;
}

/** Rule 3 — chrome anchors (unsubscribe, view in browser, share, …). */
function removeChromeAnchors($: CheerioAPI, report: CleanReport): void {
  $('a').each((_, el) => {
    const $el = $(el);
    if (DENY_ANCHOR_RE.test(visibleText($el))) {
      $el.remove();
      report.chromeAnchors += 1;
    }
  });
}

/** Rule 4 — the footer block and everything after it, unless that is too much. */
function removeFooter($: CheerioAPI, block: Element | null, report: CleanReport): void {
  if (!block || !$(block).closest('html').length) return;
  const $doomed = $(block).add($(block).nextAll());
  const total = visibleText($('body')).length;
  const cut = $doomed.toArray().reduce((n, el) => n + visibleText($(el)).length, 0);
  if (total > 0 && cut / total > FOOTER_MAX_SHARE) {
    report.footerGuarded = true;
    return;
  }
  report.footer += $doomed.length;
  $doomed.remove();
}

function isLayoutTable($: CheerioAPI, table: Element): boolean {
  const $t = $(table);
  if (($t.attr('role') ?? '').toLowerCase() === 'presentation') return true;
  if (['width', 'align', 'bgcolor'].some((a) => $t.attr(a) !== undefined)) return true;
  return $t.find('td, th').toArray().some((cell) => $(cell).find(BLOCK_TAGS).length > 0);
}

/**
 * Rule 5 — layout tables become divs, keeping cell order; data tables stay
 * for GFM. turndown-plugin-gfm only converts a table whose first row is a
 * heading row, and keeps the rest as raw HTML, so a surviving table's first
 * row is promoted to <th>.
 */
function unwrapLayoutTables($: CheerioAPI, report: CleanReport): void {
  // Innermost first, so an outer table's cell test sees settled children.
  for (const table of $('table').toArray().reverse()) {
    const $t = $(table);
    if (isLayoutTable($, table)) {
      $t.find('td, th, tr').each((_, cell) => {
        if ($(cell).closest('table')[0] !== table) return;
        $(cell).replaceWith($('<div></div>').append($(cell).contents()));
      });
      $t.find('tbody, thead, tfoot').each((_, sect) => {
        if ($(sect).closest('table')[0] === table) $(sect).replaceWith($(sect).contents());
      });
      $t.replaceWith($('<div></div>').append($t.contents()));
      report.layoutTables += 1;
    } else {
      const first = $t.find('tr').first();
      if ($t.find('thead').length === 0) {
        first.children('td').each((_, td) => {
          $(td).replaceWith($('<th></th>').append($(td).contents()));
        });
      }
    }
  }
}

/** Rule 6 — every surviving href to its real, untracked URL, or to text. */
function cleanLinks($: CheerioAPI, report: CleanReport): void {
  $('a[href]').each((_, el) => {
    const $el = $(el);
    const href = ($el.attr('href') ?? '').trim();
    if (!/^https?:\/\//i.test(href)) return;
    const unwrapped = unwrapOffline(href);
    const clean = unwrapped ? stripTrackingParams(unwrapped) : null;
    if (!clean || isSubscriberScoped(clean)) {
      $el.replaceWith($el.contents());
      report.linksTextOnly += 1;
    } else if (clean !== href) {
      $el.attr('href', clean);
      report.linksCleaned += 1;
    }
  });
}

/**
 * `disable` exists for emailClean.fixtures.test.ts, which turns each rule off
 * in turn and requires a golden fixture to fail — the guard against a rule
 * that passes because nothing exercises it. Production never passes it.
 */
export function cleanEmailHtml(
  html: string,
  opts: { disable?: readonly CleanRule[] } = {},
): { html: string; removed: CleanReport } {
  const on = (rule: CleanRule) => !opts.disable?.includes(rule);
  const report = emptyReport();
  const $ = cheerio.load(html);
  $('style, script, noscript, head').remove();

  if (on('hidden')) removeHidden($, report);
  if (on('imageAnchors')) removeImageAnchors($, report);
  const footer = on('footer') ? findFooterBlock($) : null;
  if (on('chromeAnchors')) removeChromeAnchors($, report);
  if (on('footer')) removeFooter($, footer, report);
  if (on('layoutTables')) unwrapLayoutTables($, report);
  if (on('links')) cleanLinks($, report);

  return { html: $('body').html() ?? '', removed: report };
}
