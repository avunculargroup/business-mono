import { describe, it, expect } from 'vitest';
import {
  cleanStoredMarkdown,
  scoredWindowChange,
  planDuplicates,
  mergeCuratorNotes,
  toCsv,
  parseCsv,
  approvedRows,
  type BackfillRow,
} from './newsletterBackfill.js';

const b64 = (s: string) => Buffer.from(s).toString('base64');

describe('cleanStoredMarkdown', () => {
  it('decodes encodable wrappers and strips tracking parameters', () => {
    const sa = `https://email-st.seekingalpha.com/click/1.2/${b64('https://seekingalpha.com/article/1-x?userid=9')}/sig`;
    expect(cleanStoredMarkdown(`Read [the piece](${sa}) and [this](https://afr.com/a?utm_source=nl).`)).toBe(
      'Read [the piece](https://seekingalpha.com/article/1-x) and [this](https://afr.com/a).',
    );
  });

  it('reduces an opaque wrapper link to its text', () => {
    expect(cleanStoredMarkdown('See [the report](https://example.ghost.io/r/0a1b2c3d?m=placeholder).')).toBe('See the report.');
  });

  it('drops bare subscriber-scoped URLs and cleans bare tracked ones', () => {
    expect(cleanStoredMarkdown('Online: https://d1.na1.hubspotlinks.com/Ctc/p\nAlso https://afr.com/a?utm_source=x')).toBe(
      'Online:\nAlso https://afr.com/a',
    );
  });

  it('removes empty links, spacer characters and the subject line', () => {
    expect(cleanStoredMarkdown('Issue 42\n͏͏[](https://t.example/x)\n\nBody', 'Issue 42')).toBe('Body');
  });

  it('leaves clean content and non-http links unchanged', () => {
    const md = 'A [link](https://afr.com/a) and [mail](mailto:a@example.com).';
    expect(cleanStoredMarkdown(md)).toBe(md);
  });
});

describe('scoredWindowChange', () => {
  it('is 0 for identical bodies and 1 for a body that was empty', () => {
    expect(scoredWindowChange('same', 'same')).toBe(0);
    expect(scoredWindowChange('', 'new')).toBe(1);
  });

  it('measures removed and added lines against the old window', () => {
    const old = `${'k'.repeat(80)}\n${'x'.repeat(20)}`;
    expect(scoredWindowChange(old, 'k'.repeat(80))).toBeCloseTo(20 / 101, 2);
  });

  it('only reads the first 12,000 characters', () => {
    const head = 'h'.repeat(12_000);
    expect(scoredWindowChange(`${head}\ntail one`, `${head}\ntail two`)).toBe(0);
  });

  it('flags a body whose window was mostly tracking URL', () => {
    const old = `[Read](https://d1.na1.hubspotlinks.com/${'x'.repeat(1000)})\nShort body.`;
    expect(scoredWindowChange(old, 'Read\nShort body.')).toBeGreaterThan(0.2);
  });
});

describe('planDuplicates', () => {
  it('keeps the higher score, then the earlier row, and folds the rest in', () => {
    const plan = planDuplicates([
      { id: 'a', url: 'https://afr.com/x', relevanceScore: 0.3, createdAt: '2026-10-01' },
      { id: 'b', url: 'https://afr.com/x', relevanceScore: 0.6, createdAt: '2026-10-03' },
      { id: 'c', url: 'https://afr.com/x', relevanceScore: 0.6, createdAt: '2026-10-02' },
      { id: 'd', url: 'https://afr.com/y', relevanceScore: null, createdAt: '2026-10-01' },
    ]);
    expect(plan).toEqual([{ keep: 'c', remove: ['b', 'a'], url: 'https://afr.com/x' }]);
  });

  it('ranks a null score below any score', () => {
    const plan = planDuplicates([
      { id: 'a', url: 'u', relevanceScore: null, createdAt: '2026-01-01' },
      { id: 'b', url: 'u', relevanceScore: 0, createdAt: '2026-02-01' },
    ]);
    expect(plan[0]!.keep).toBe('b');
  });
});

describe('mergeCuratorNotes', () => {
  it('keeps the keeper first and drops repeats and blanks', () => {
    expect(mergeCuratorNotes('Keep', ['Other', 'Keep', null, '  '])).toBe('Keep\n\nOther');
    expect(mergeCuratorNotes(null, [null])).toBeNull();
  });
});

describe('report', () => {
  const row = (over: Partial<BackfillRow>): BackfillRow => ({
    action: 'update_url',
    id: 'r1',
    source: 'TFTC',
    title: 'A "quoted", title\nwith a newline',
    oldUrlHost: 'example.ghost.io',
    newUrl: 'https://afr.com/x',
    keepId: '',
    reason: '',
    bodyChangePct: '',
    rescore: 'no',
    approve: '',
    ...over,
  });

  it('round-trips through CSV, quotes and newlines included', () => {
    const rows = [row({}), row({ id: 'r2', action: 'merge', keepId: 'r1' })];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('authorises updates present in the report, and removals only with approve=yes', () => {
    const planned = [
      row({ id: 'u1' }),
      row({ id: 'u2' }),
      row({ id: 'd1', action: 'delete_filtered' }),
      row({ id: 'd2', action: 'delete_unresolvable' }),
      row({ id: 'm1', action: 'merge', keepId: 'u1' }),
    ];
    const reviewed = [
      row({ id: 'u1' }),
      row({ id: 'd1', action: 'delete_filtered', approve: 'yes' }),
      row({ id: 'd2', action: 'delete_unresolvable', approve: '' }),
      row({ id: 'm1', action: 'merge', keepId: 'u1', approve: 'YES ' }),
    ];
    expect(approvedRows(planned, reviewed).map((r) => r.id)).toEqual(['u1', 'd1', 'm1']);
  });

  it('refuses a row whose target changed since the review', () => {
    const planned = [row({ id: 'u1', newUrl: 'https://afr.com/changed' })];
    expect(approvedRows(planned, [row({ id: 'u1' })])).toEqual([]);
  });
});
