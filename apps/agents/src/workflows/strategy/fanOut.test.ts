import { describe, it, expect } from 'vitest';
import { planEntriesToVariantInputs } from './fanOut.js';
import type { SchedulePlan } from './schemas.js';

function plan(entries: SchedulePlan['entries']): SchedulePlan {
  return {
    posts_per_week: 2,
    duration_weeks: 1,
    start_date: '2026-07-07',
    slots: [],
    entries,
  };
}

describe('planEntriesToVariantInputs', () => {
  it('maps each entry with a beat_id to a variant input + its scheduled_for', () => {
    const out = planEntriesToVariantInputs(
      'camp-1',
      plan([
        {
          beat_sequence: 1,
          beat_title: 'B1',
          beat_id: 'beat-1',
          social_account_id: 'acct-a',
          slot_label: 'Tue am',
          scheduled_for: '2026-07-07T09:00:00',
        },
        {
          beat_sequence: 1,
          beat_title: 'B1',
          beat_id: 'beat-1',
          social_account_id: 'acct-b',
          slot_label: null,
          scheduled_for: null,
        },
      ]),
    );
    expect(out).toEqual([
      {
        input: { campaignId: 'camp-1', beatId: 'beat-1', socialAccountId: 'acct-a' },
        scheduledFor: '2026-07-07T09:00:00',
      },
      {
        input: { campaignId: 'camp-1', beatId: 'beat-1', socialAccountId: 'acct-b' },
        scheduledFor: null,
      },
    ]);
  });

  it('skips entries with no persisted beat_id', () => {
    const out = planEntriesToVariantInputs(
      'camp-1',
      plan([
        {
          beat_sequence: 1,
          beat_title: 'B1',
          beat_id: null,
          social_account_id: 'acct-a',
          slot_label: null,
          scheduled_for: null,
        },
      ]),
    );
    expect(out).toEqual([]);
  });
});
