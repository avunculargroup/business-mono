import { describe, expect, it } from 'vitest';
import {
  daysUntilReview,
  isAwaitingReview,
  isLive,
  reviewUrgency,
  sortQueue,
  type ReviewableRow,
} from './queue';

function row(overrides: Partial<ReviewableRow> = {}): ReviewableRow {
  return {
    id: 'id',
    slug: 'slug',
    title: 'Title',
    status: 'draft',
    lexReviewedAt: null,
    reviewDueDate: null,
    ...overrides,
  };
}

describe('isAwaitingReview', () => {
  it.each(['draft', 'under_review', 'lex_review', 'approved'])(
    'counts %s as awaiting',
    (status) => {
      expect(isAwaitingReview(row({ status }))).toBe(true);
    },
  );

  it.each(['active', 'published', 'superseded', 'archived'])(
    'does not count %s as awaiting',
    (status) => {
      expect(isAwaitingReview(row({ status }))).toBe(false);
    },
  );
});

describe('isLive', () => {
  it('is active for a template and published for a library entry', () => {
    // The two tables spell the same state differently, which is exactly the
    // kind of thing a queue rendering both gets subtly wrong.
    expect(isLive(row({ status: 'active' }), 'template')).toBe(true);
    expect(isLive(row({ status: 'published' }), 'template')).toBe(false);
    expect(isLive(row({ status: 'published' }), 'library')).toBe(true);
    expect(isLive(row({ status: 'active' }), 'library')).toBe(false);
  });
});

describe('daysUntilReview', () => {
  const today = new Date('2026-09-12T09:30:00Z');

  it('counts forward to a future date', () => {
    expect(daysUntilReview('2026-09-19', today)).toBe(7);
  });

  it('returns zero on the day itself', () => {
    expect(daysUntilReview('2026-09-12', today)).toBe(0);
  });

  it('goes negative once overdue', () => {
    expect(daysUntilReview('2026-08-13', today)).toBe(-30);
  });

  it('ignores the time of day', () => {
    // Otherwise a review due today reads as due yesterday every afternoon.
    expect(daysUntilReview('2026-09-13', new Date('2026-09-12T23:59:00Z'))).toBe(1);
  });

  it('returns null when nothing is scheduled', () => {
    expect(daysUntilReview(null, today)).toBeNull();
  });

  it('returns null rather than NaN for an unparseable date', () => {
    expect(daysUntilReview('not-a-date', today)).toBeNull();
  });
});

describe('reviewUrgency', () => {
  it('separates overdue from due soon from scheduled', () => {
    expect(reviewUrgency(-1)).toBe('overdue');
    expect(reviewUrgency(0)).toBe('soon');
    expect(reviewUrgency(30)).toBe('soon');
    expect(reviewUrgency(31)).toBe('scheduled');
  });

  it('calls an absent due date unscheduled, not scheduled', () => {
    // A live row nobody will ever revisit is a finding, not a blank cell.
    expect(reviewUrgency(null)).toBe('unscheduled');
  });
});

describe('sortQueue', () => {
  it('puts the most overdue first and the unscheduled last', () => {
    const sorted = sortQueue([
      row({ slug: 'none', reviewDueDate: null }),
      row({ slug: 'later', reviewDueDate: '2099-01-01' }),
      row({ slug: 'overdue', reviewDueDate: '2000-01-01' }),
    ]);

    expect(sorted.map((r) => r.slug)).toEqual(['overdue', 'later', 'none']);
  });

  it('breaks ties on slug so the order does not shuffle between renders', () => {
    const sorted = sortQueue([
      row({ slug: 'b', reviewDueDate: '2026-10-01' }),
      row({ slug: 'a', reviewDueDate: '2026-10-01' }),
    ]);

    expect(sorted.map((r) => r.slug)).toEqual(['a', 'b']);
  });

  it('orders unscheduled rows among themselves by slug', () => {
    const sorted = sortQueue([row({ slug: 'z' }), row({ slug: 'a' })]);

    expect(sorted.map((r) => r.slug)).toEqual(['a', 'z']);
  });

  it('does not mutate its input', () => {
    const rows = [row({ slug: 'b', reviewDueDate: '2099-01-01' }), row({ slug: 'a' })];
    sortQueue(rows);

    expect(rows.map((r) => r.slug)).toEqual(['b', 'a']);
  });
});
