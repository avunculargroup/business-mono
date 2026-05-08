// Timezone helpers built on `Intl.DateTimeFormat`. The runtime ships IANA
// timezone data so we don't pull in a third-party date library.

// IANA timezone -> offset in minutes east of UTC at instant `at`.
// Correctly accounts for DST transitions because the offset is computed
// from the formatter's wall-clock output for that specific instant.
export function offsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const lookup: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') lookup[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(lookup['year']),
    Number(lookup['month']) - 1,
    Number(lookup['day']),
    Number(lookup['hour'] === '24' ? '0' : lookup['hour']),
    Number(lookup['minute']),
    Number(lookup['second']),
  );
  return (asUTC - at.getTime()) / 60000;
}

// UTC `Date` representing midnight of the given wall-clock date in `timeZone`.
// DST-safe: we refine the offset using the offset at the candidate instant,
// so spring-forward/fall-back days resolve to the correct UTC moment.
function localMidnightInTz(
  timeZone: string,
  year: number,
  month: number,
  day: number,
): Date {
  const wallClockAsUtcMs = Date.UTC(year, month, day, 0, 0, 0);
  const guessOffset = offsetMinutes(timeZone, new Date(wallClockAsUtcMs));
  const firstGuess = wallClockAsUtcMs - guessOffset * 60000;
  const refinedOffset = offsetMinutes(timeZone, new Date(firstGuess));
  return new Date(wallClockAsUtcMs - refinedOffset * 60000);
}

// UTC instants bracketing the wall-clock day in `timeZone` that contains `at`.
// Returns `[start, end)` — start is 00:00 local, end is 00:00 the next local day.
export function dayBoundsInTz(
  timeZone: string,
  at: Date = new Date(),
): { start: Date; end: Date } {
  const offsetAtNow = offsetMinutes(timeZone, at);
  const localNow = new Date(at.getTime() + offsetAtNow * 60000);
  const y = localNow.getUTCFullYear();
  const m = localNow.getUTCMonth();
  const d = localNow.getUTCDate();
  return {
    start: localMidnightInTz(timeZone, y, m, d),
    end: localMidnightInTz(timeZone, y, m, d + 1),
  };
}
