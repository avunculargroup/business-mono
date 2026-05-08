import type { RoutineFrequency } from './routines.js';
import { offsetMinutes } from './tz.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const FREQUENCY_DAYS: Record<RoutineFrequency, number> = {
  daily: 1,
  weekly: 7,
  fortnightly: 14,
};

// Returns the next UTC timestamp at which the routine should run.
// Semantics: walk forward from `from` by one frequency step; align to the
// requested `time_of_day` in the routine's timezone. Result is strictly in
// the future relative to `from`.
export function computeNextRunAt(params: {
  frequency: RoutineFrequency;
  timeOfDay: string; // 'HH:MM' or 'HH:MM:SS'
  timezone: string;
  from?: Date;
}): Date {
  const from = params.from ?? new Date();
  const stepDays = FREQUENCY_DAYS[params.frequency];
  const [hh, mm] = params.timeOfDay.split(':');
  const targetHour = Number(hh ?? '7');
  const targetMinute = Number(mm ?? '0');

  const nowInTz = new Date(from.getTime() + offsetMinutes(params.timezone, from) * 60000);
  const candidateLocal = new Date(
    Date.UTC(
      nowInTz.getUTCFullYear(),
      nowInTz.getUTCMonth(),
      nowInTz.getUTCDate(),
      targetHour,
      targetMinute,
      0,
      0,
    ),
  );
  const approxUtc = candidateLocal.getTime() - offsetMinutes(params.timezone, candidateLocal) * 60000;
  let candidate = new Date(approxUtc);

  if (params.frequency === 'daily') {
    while (candidate.getTime() <= from.getTime()) {
      candidate = new Date(candidate.getTime() + DAY_MS);
    }
  } else {
    while (candidate.getTime() <= from.getTime()) {
      candidate = new Date(candidate.getTime() + stepDays * DAY_MS);
    }
  }

  return candidate;
}
