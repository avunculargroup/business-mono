import { describe, it, expect } from 'vitest';
import { chunkReport } from './chunk.js';

const para = (n: number) => `Paragraph ${n}. ${'Institutional flows continued to broaden. '.repeat(20)}`;

describe('chunkReport', () => {
  it('never lets a chunk cross a page boundary', () => {
    // The rule the citation anchor depends on: a passage spanning two pages
    // cannot be cited cleanly.
    const drafts = chunkReport(['short page one', 'short page two', 'short page three'], true);
    expect(drafts.map((d) => d.pageNumber)).toEqual([1, 2, 3]);
    expect(drafts[0].content).toBe('short page one');
  });

  it('numbers pages from 1 and leaves page_number null for HTML', () => {
    expect(chunkReport(['a'], true)[0].pageNumber).toBe(1);
    expect(chunkReport(['a'], false)[0].pageNumber).toBeNull();
  });

  it('builds a heading breadcrumb and carries it across pages', () => {
    const drafts = chunkReport(
      ['# Outlook\n\n## Mining economics\n\nHash rate rose.', 'Costs fell further.'],
      true,
    );
    expect(drafts[0].headingPath).toBe('Outlook > Mining economics');
    // A section heading on one page still governs the next.
    expect(drafts[1].headingPath).toBe('Outlook > Mining economics');
  });

  it('pops the heading stack when a shallower heading opens', () => {
    const drafts = chunkReport(
      ['# Outlook\n\n## Mining\n\nA.\n\n# Appendix\n\nB.'],
      true,
    );
    expect(drafts[drafts.length - 1].headingPath).toBe('Appendix');
  });

  it('splits a long page into several chunks with overlap', () => {
    const page = [para(1), para(2), para(3), para(4), para(5)].join('\n\n');
    const drafts = chunkReport([page], true);

    expect(drafts.length).toBeGreaterThan(1);
    expect(drafts.every((d) => d.pageNumber === 1)).toBe(true);
    // Overlap: the head of chunk 2 reappears at the tail of chunk 1, so a
    // passage split across the boundary is retrievable from either side.
    const head = drafts[1].content.slice(0, 50);
    expect(drafts[0].content).toContain(head);
  });

  it('splits a single oversized block rather than letting it swallow the page', () => {
    const wall = 'x'.repeat(20_000);
    const drafts = chunkReport([wall], true);
    expect(drafts.length).toBeGreaterThan(1);
  });

  it('assigns contiguous segment indices across pages', () => {
    const drafts = chunkReport([para(1), para(2)], true);
    expect(drafts.map((d) => d.segmentIndex)).toEqual(drafts.map((_, i) => i));
  });

  it('skips blank pages without emitting empty segments', () => {
    const drafts = chunkReport(['real text here', '', '   '], true);
    expect(drafts).toHaveLength(1);
  });

  it('estimates a token count for every chunk', () => {
    const drafts = chunkReport(['some report text'], true);
    expect(drafts[0].tokenCount).toBeGreaterThan(0);
  });
});
