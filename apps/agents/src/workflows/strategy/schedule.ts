import type { ScheduleSlot, ScheduleEntry, SchedulePlan } from './schemas.js';

// Pure scheduler for the Campaign Strategy workflow. Distributes the
// (beat × participating account) variants across the configured post slots over
// the campaign duration. Kept pure (no DB, no Date.now) so it can be unit-tested
// and so the Gate 2 UI renders exactly what fan-out (Step 8) will read.
//
// Phase 1 decisions (CAMPAIGNS_BUILD_ORDER.md open questions, documented):
//   * posts_per_week is a TOTAL across accounts, not per-account.
//   * Simple in-order fill — no optimisation, no cross-account staggering.
//   * Slots are planning targets for manual posting; precise dispatch is Phase 2.
// When capacity (posts_per_week × duration_weeks) is exceeded, the surplus
// variants are still planned but left unscheduled (scheduled_for = null).

// Two-letter day codes used in campaigns.post_slots, mapped Monday-first.
const DAY_INDEX: Record<string, number> = {
  MO: 0,
  TU: 1,
  WE: 2,
  TH: 3,
  FR: 4,
  SA: 5,
  SU: 6,
};

/** Monday-first weekday (0=Mon … 6=Sun) of a YYYY-MM-DD date, in UTC so the
 *  result is independent of the host timezone. */
function weekdayOf(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return (d.getUTCDay() + 6) % 7; // JS: 0=Sun → shift so Mon=0
}

/** Add n days to a YYYY-MM-DD date, returning YYYY-MM-DD (UTC arithmetic). */
function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The scheduled_for for a slot in a given week, relative to the campaign start.
 *  Week 0's slot on the start weekday falls on start_date itself; other days
 *  fall later that same week — so no slot ever lands before start_date. */
function slotDateTime(startDate: string, week: number, slot: ScheduleSlot): string | null {
  const dayIndex = DAY_INDEX[slot.day?.toUpperCase()];
  if (dayIndex == null) return null;
  const offset = (dayIndex - weekdayOf(startDate) + 7) % 7;
  const date = addDays(startDate, week * 7 + offset);
  const time = /^\d{2}:\d{2}$/.test(slot.time) ? slot.time : '09:00';
  return `${date}T${time}:00`;
}

export interface BeatRef {
  sequence: number;
  title: string | null;
}

export interface BuildScheduleArgs {
  /** Ordered beats (by sequence). */
  beats: BeatRef[];
  /** Participating account ids, in fan-out order. */
  accountIds: string[];
  slots: ScheduleSlot[];
  postsPerWeek: number;
  durationWeeks: number;
  startDate: string | null;
}

/**
 * Build the schedule plan. Work items are (beat × account) in beat-major order;
 * posting opportunities are generated week-by-week, postsPerWeek per week,
 * cycling through the configured slots. Items are assigned to opportunities in
 * order; any surplus is left unscheduled.
 */
export function buildSchedule(args: BuildScheduleArgs): SchedulePlan {
  const { beats, accountIds, slots, postsPerWeek, durationWeeks, startDate } = args;

  // Work items: every (beat × account) pair, beat-major.
  const items: Array<{ beat_sequence: number; beat_title: string | null; social_account_id: string }> =
    [];
  for (const beat of beats) {
    for (const accountId of accountIds) {
      items.push({
        beat_sequence: beat.sequence,
        beat_title: beat.title,
        social_account_id: accountId,
      });
    }
  }

  // Posting opportunities, chronological (week-major, slot order within a week).
  const opportunities: Array<{ slot_label: string | null; scheduled_for: string | null }> = [];
  const canSchedule =
    startDate != null && slots.length > 0 && postsPerWeek > 0 && durationWeeks > 0;
  if (canSchedule) {
    for (let week = 0; week < durationWeeks; week += 1) {
      for (let i = 0; i < postsPerWeek; i += 1) {
        const slot = slots[i % slots.length]!;
        opportunities.push({
          slot_label: slot.label ?? null,
          scheduled_for: slotDateTime(startDate, week, slot),
        });
      }
    }
  }

  const entries: ScheduleEntry[] = items.map((item, idx) => {
    const opp = opportunities[idx];
    return {
      beat_sequence: item.beat_sequence,
      beat_title: item.beat_title,
      beat_id: null,
      social_account_id: item.social_account_id,
      slot_label: opp?.slot_label ?? null,
      scheduled_for: opp?.scheduled_for ?? null,
    };
  });

  return {
    posts_per_week: postsPerWeek,
    duration_weeks: durationWeeks,
    start_date: startDate,
    slots,
    entries,
  };
}

/**
 * Stamp the persisted beat ids onto a schedule plan once beats have rows.
 * Entries whose sequence has no id (shouldn't happen) keep beat_id = null.
 */
export function finaliseSchedulePlan(
  plan: SchedulePlan,
  beatIdBySequence: Map<number, string>,
): SchedulePlan {
  return {
    ...plan,
    entries: plan.entries.map((e) => ({
      ...e,
      beat_id: beatIdBySequence.get(e.beat_sequence) ?? null,
    })),
  };
}
