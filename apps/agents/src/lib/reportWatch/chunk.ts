/**
 * Page-anchored chunking for report_segments.
 *
 * Target 800 tokens with 100 token overlap, and two hard rules:
 *
 *   1. A chunk NEVER crosses a page boundary in a PDF. A passage that spans two
 *      pages cannot be cited cleanly, and citation is the whole reason
 *      `page_number` exists.
 *   2. Heading boundaries win over the token target when they fall within 30%
 *      of it. Splitting mid-argument to hit a round number produces chunks that
 *      retrieve well and read badly.
 *
 * Headings are tracked into a `heading_path` breadcrumb ("Outlook > Mining
 * economics") because it is the locator for HTML, where there are no pages, and
 * useful context for a retrieved PDF passage either way.
 */

const CHARS_PER_TOKEN = 4;
const TARGET_TOKENS = 800;
const OVERLAP_TOKENS = 100;
const TARGET_CHARS = TARGET_TOKENS * CHARS_PER_TOKEN;
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN;
/** A heading this close to the target is a better split point than the target. */
const HEADING_TOLERANCE = 0.3;

export interface SegmentDraft {
  segmentIndex: number;
  /** 1-based. Null for HTML. */
  pageNumber: number | null;
  headingPath: string | null;
  content: string;
  tokenCount: number;
}

const estimateTokens = (text: string) => Math.ceil(text.length / CHARS_PER_TOKEN);

interface Block {
  text: string;
  /** Markdown heading level, or 0 for body text. */
  level: number;
}

/** Split page text into heading and paragraph blocks, in order. */
function toBlocks(page: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of page.split(/\n{2,}/)) {
    const text = raw.trim();
    if (!text) continue;
    const heading = /^(#{1,6})\s+(.*)$/.exec(text);
    blocks.push(heading ? { text: heading[2].trim(), level: heading[1].length } : { text, level: 0 });
  }
  return blocks;
}

/** Maintain the enclosing-heading breadcrumb as levels open and close. */
function pushHeading(stack: Array<{ level: number; text: string }>, block: Block): void {
  while (stack.length > 0 && stack[stack.length - 1]!.level >= block.level) stack.pop();
  stack.push({ level: block.level, text: block.text });
}

const breadcrumb = (stack: Array<{ level: number; text: string }>): string | null =>
  stack.length > 0 ? stack.map((h) => h.text).join(' > ') : null;

/**
 * Overlap tail from the previous chunk, so a passage split across a boundary is
 * still retrievable from either side. Taken at a sentence break where one is
 * available — a half-sentence prefix reads as noise.
 */
function overlapTail(text: string): string {
  if (text.length <= OVERLAP_CHARS) return text;
  const tail = text.slice(-OVERLAP_CHARS);
  const breakAt = tail.search(/[.!?]\s/);
  return breakAt >= 0 ? tail.slice(breakAt + 2) : tail;
}

/**
 * Chunk one document.
 *
 * `pages` is per-page for PDFs and a single entry for HTML; `hasPages` decides
 * whether `page_number` is populated. The heading stack is carried ACROSS pages
 * — a section heading on page 12 still governs page 13 — while the chunks
 * themselves are not.
 */
export function chunkReport(pages: string[], hasPages: boolean): SegmentDraft[] {
  const drafts: SegmentDraft[] = [];
  const headingStack: Array<{ level: number; text: string }> = [];

  pages.forEach((page, pageIdx) => {
    const blocks = toBlocks(page);
    if (blocks.length === 0) return;

    let buffer = '';

    // The breadcrumb is read at FLUSH time, not when the buffer opens: a chunk
    // is described by the deepest heading governing the text it actually
    // contains, and that is only known once the chunk is closed.
    const flush = () => {
      const content = buffer.trim();
      if (!content) return;
      drafts.push({
        segmentIndex: drafts.length,
        pageNumber: hasPages ? pageIdx + 1 : null,
        headingPath: breadcrumb(headingStack),
        content,
        tokenCount: estimateTokens(content),
      });
      buffer = overlapTail(content);
    };

    for (const block of blocks) {
      if (block.level > 0) {
        // A heading within 30% of the target is a better split point than the
        // target itself — it is where the argument actually turns. Flushed
        // BEFORE the stack moves, so the closing chunk keeps its own section.
        if (buffer.length >= TARGET_CHARS * (1 - HEADING_TOLERANCE)) flush();
        pushHeading(headingStack, block);
        buffer += `${buffer ? '\n\n' : ''}${'#'.repeat(block.level)} ${block.text}`;
        continue;
      }

      if (buffer.length > 0 && buffer.length + block.text.length > TARGET_CHARS) flush();
      buffer += `${buffer ? '\n\n' : ''}${block.text}`;

      // A single block longer than the target (a wall-of-text page) still has
      // to be split, or one chunk swallows the page and retrieves for
      // everything.
      while (buffer.length > TARGET_CHARS * 1.5) {
        const head = buffer.slice(0, TARGET_CHARS);
        drafts.push({
          segmentIndex: drafts.length,
          pageNumber: hasPages ? pageIdx + 1 : null,
          headingPath: breadcrumb(headingStack),
          content: head.trim(),
          tokenCount: estimateTokens(head),
        });
        buffer = overlapTail(head) + buffer.slice(TARGET_CHARS);
      }
    }

    // Never carry a partial chunk into the next page — rule 1.
    const content = buffer.trim();
    if (content) {
      drafts.push({
        segmentIndex: drafts.length,
        pageNumber: hasPages ? pageIdx + 1 : null,
        headingPath: breadcrumb(headingStack),
        content,
        tokenCount: estimateTokens(content),
      });
    }
  });

  return drafts;
}
