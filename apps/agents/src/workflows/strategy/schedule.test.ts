import { describe, it, expect } from 'vitest';
import { buildSchedule, finaliseSchedulePlan, type BeatRef } from './schedule.js';
import type { ScheduleSlot } from './schemas.js';

const slots: ScheduleSlot[] = [
  { day: 'TU', time: '09:00', label: 'Tuesday morning' },
  { day: 'TH', time: '09:00', label: 'Thursday morning' },
];

const beats: BeatRef[] = [
  { sequence: 1, title: 'Volatility vs risk' },
  { sequence: 2, title: 'AU regulatory clarity' },
];

describe('buildSchedule', () => {
  it('creates one entry per (beat × account), beat-major', () => {
    const plan = buildSchedule({
      beats,
      accountIds: ['acct-a', 'acct-b'],
      slots,
      postsPerWeek: 4,
      durationWeeks: 2,
      startDate: '2026-07-07', // a Tuesday
    });
    expect(plan.entries).toHaveLength(4); // 2 beats × 2 accounts
    expect(plan.entries.map((e) => [e.beat_sequence, e.social_account_id])).toEqual([
      [1, 'acct-a'],
      [1, 'acct-b'],
      [2, 'acct-a'],
      [2, 'acct-b'],
    ]);
  });

  it('places slots relative to the start weekday — week 0 start day is start_date', () => {
    const plan = buildSchedule({
      beats: [{ sequence: 1, title: 'B1' }],
      accountIds: ['a', 'b'],
      slots,
      postsPerWeek: 2,
      durationWeeks: 1,
      startDate: '2026-07-07', // Tuesday → TU slot lands on the start date
    });
    expect(plan.entries[0]!.scheduled_for).toBe('2026-07-07T09:00:00'); // TU
    expect(plan.entries[0]!.slot_label).toBe('Tuesday morning');
    expect(plan.entries[1]!.scheduled_for).toBe('2026-07-09T09:00:00'); // TH same week
    expect(plan.entries[1]!.slot_label).toBe('Thursday morning');
  });

  it('advances week by week once a week is full', () => {
    const plan = buildSchedule({
      beats,
      accountIds: ['a'],
      slots,
      postsPerWeek: 1, // one post per week → second beat slips to week 1
      durationWeeks: 2,
      startDate: '2026-07-07',
    });
    expect(plan.entries[0]!.scheduled_for).toBe('2026-07-07T09:00:00'); // week 0, TU
    expect(plan.entries[1]!.scheduled_for).toBe('2026-07-14T09:00:00'); // week 1, TU
  });

  it('leaves surplus variants unscheduled when capacity is exceeded', () => {
    const plan = buildSchedule({
      beats,
      accountIds: ['a', 'b'], // 4 variants
      slots,
      postsPerWeek: 1,
      durationWeeks: 1, // capacity = 1
      startDate: '2026-07-07',
    });
    expect(plan.entries[0]!.scheduled_for).toBe('2026-07-07T09:00:00');
    expect(plan.entries.slice(1).every((e) => e.scheduled_for === null)).toBe(true);
    expect(plan.entries[1]!.slot_label).toBeNull();
  });

  it('cycles slots when posts_per_week exceeds the slot count', () => {
    const plan = buildSchedule({
      beats: [{ sequence: 1, title: 'B' }],
      accountIds: ['a', 'b', 'c'],
      slots, // 2 slots
      postsPerWeek: 3,
      durationWeeks: 1,
      startDate: '2026-07-07',
    });
    // 3rd opportunity reuses slot[0] (TU).
    expect(plan.entries[2]!.scheduled_for).toBe('2026-07-07T09:00:00');
    expect(plan.entries[2]!.slot_label).toBe('Tuesday morning');
  });

  it('leaves everything unscheduled with no start date or no slots', () => {
    const noStart = buildSchedule({
      beats,
      accountIds: ['a'],
      slots,
      postsPerWeek: 2,
      durationWeeks: 2,
      startDate: null,
    });
    expect(noStart.entries.every((e) => e.scheduled_for === null)).toBe(true);

    const noSlots = buildSchedule({
      beats,
      accountIds: ['a'],
      slots: [],
      postsPerWeek: 2,
      durationWeeks: 2,
      startDate: '2026-07-07',
    });
    expect(noSlots.entries.every((e) => e.scheduled_for === null)).toBe(true);
  });
});

describe('finaliseSchedulePlan', () => {
  it('stamps persisted beat ids onto entries by sequence', () => {
    const plan = buildSchedule({
      beats,
      accountIds: ['a'],
      slots,
      postsPerWeek: 2,
      durationWeeks: 1,
      startDate: '2026-07-07',
    });
    const finalised = finaliseSchedulePlan(
      plan,
      new Map([
        [1, 'beat-id-1'],
        [2, 'beat-id-2'],
      ]),
    );
    expect(finalised.entries[0]!.beat_id).toBe('beat-id-1');
    expect(finalised.entries[1]!.beat_id).toBe('beat-id-2');
  });
});
