/**
 * HTML → markdown, for report_watch sources whose "report" is a long web page
 * rather than a PDF.
 *
 * Jina Reader first (it strips publisher chrome — nav, cookie banners, related
 * -article rails — far better than a tag stripper can), Turndown on the raw
 * bytes as the fallback. Same order and same reasoning as fetchFeed.ts, which
 * is where the Jina precedent in this codebase comes from.
 *
 * There are no pages in HTML, so this returns a single "page". `page_number`
 * stays NULL on the resulting segments and the locator falls back to
 * `heading_path` — which is why the chunker tracks headings for both formats
 * rather than only for PDFs.
 */

import TurndownService from 'turndown';
import { fetchText } from '../http.js';
import { createLogger } from '../../logger.js';

const log = createLogger('report-watch-html');

const MAX_HTML_CHARS = 1_000_000;

let turndown: TurndownService | null = null;
function getTurndown(): TurndownService {
  if (!turndown) {
    turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    turndown.remove(['script', 'style', 'noscript', 'nav', 'footer', 'form']);
  }
  return turndown;
}

/** Best-effort <title> / first <h1>, for the title waterfall. */
export function htmlTitle(html: string): string | null {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const pick = (h1 ?? title ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return pick || null;
}

function toMarkdown(html: string): string {
  const bounded = html.length > MAX_HTML_CHARS ? html.slice(0, MAX_HTML_CHARS) : html;
  try {
    return getTurndown().turndown(bounded).trim();
  } catch (err) {
    log.warn({ err }, 'turndown failed — falling back to tag strip');
    return bounded
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

export interface HtmlExtraction {
  ok: true;
  /** Always exactly one entry — HTML has no pages. */
  pages: string[];
  title: string | null;
  /** 'html_jina' when the reader served it, otherwise the local conversion. */
  viaJina: boolean;
}

export type HtmlExtractionResult = HtmlExtraction | { ok: false; message: string };

export async function extractHtml(
  url: string,
  rawHtml: string,
): Promise<HtmlExtractionResult> {
  const title = htmlTitle(rawHtml);

  const jina = await fetchText(`https://r.jina.ai/${encodeURIComponent(url)}`, {
    Accept: 'text/plain',
    'X-Return-Format': 'markdown',
  });
  if (jina.ok && jina.body.trim().length > 0) {
    return { ok: true, pages: [jina.body.trim()], title, viaJina: true };
  }

  const markdown = toMarkdown(rawHtml);
  if (!markdown) return { ok: false, message: 'HTML produced no extractable text' };
  return { ok: true, pages: [markdown], title, viaJina: false };
}
