/**
 * Relative dating.
 *
 * Fixtures never carry absolute dates for anything the UI bands by urgency or
 * recency: a demo authored with a report dated 12 September looks sharp in
 * August and broken in October. Every date-bearing fixture stores an **offset
 * in days from the anchor**, and the adapter resolves it at read time against
 * `ReadContext.asOf` — which defaults to now, so the staged scenario holds
 * forever without maintenance.
 *
 * See [`fixture-and-trace-schema.md` § The relative dating rule](../../../../docs/features/demo-app/fixture-and-trace-schema.md#the-relative-dating-rule).
 */

/** Days from the anchor. Negative is the past, which is where nearly everything is. */
export type DayOffset = number;

const MS_PER_DAY = 86_400_000;

export function addDays(anchor: Date, days: DayOffset): Date {
  return new Date(anchor.getTime() + days * MS_PER_DAY);
}

/** An offset resolved to the ISO timestamp the read models carry. */
export function at(anchor: Date, days: DayOffset): string {
  return addDays(anchor, days).toISOString();
}

/** An offset resolved to a `YYYY-MM-DD` date, for the models that carry dates. */
export function onDate(anchor: Date, days: DayOffset): string {
  return addDays(anchor, days).toISOString().slice(0, 10);
}

/**
 * A fixed hour on the anchor's own calendar day, in UTC.
 *
 * `at(anchor, -0.2)` is "a few hours ago", which crosses midnight whenever the
 * anchor is early enough — and anything that has to be *today* (the digest is
 * the one that bites) then silently isn't. This says the calendar day
 * explicitly and cannot drift out of it.
 */
export function todayAt(anchor: Date, hourUtc: number): string {
  const day = new Date(anchor);
  day.setUTCHours(hourUtc, 0, 0, 0);
  return day.toISOString();
}
