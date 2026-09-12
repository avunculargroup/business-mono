/**
 * What running Minute needs to be able to see.
 *
 * Three questions, and none of them had an answer before this module existed:
 *
 *   Who is locked out?     Publishing a Service Statement version forces every
 *                          subscriber to re-acknowledge. They cannot use the
 *                          app until they do, and nothing said who they were.
 *                          The button that causes it is one click.
 *
 *   Who received this?     `prepare_generations` exists, in its own comment,
 *                          so that "if a template is later found to be wrong,
 *                          this answers who received it." Nothing read it, so
 *                          the question could not be asked.
 *
 *   Is anyone using it?    `last_seen_at` sits on every seat and was never
 *                          aggregated. Pre-revenue with a handful of accounts,
 *                          a quiet account is the churn signal that matters.
 *
 * Pure functions over plain rows, because the rules are the part that must not
 * be wrong and a wrong answer here is either a subscriber left at the gate or a
 * recall that misses someone.
 */

export interface SeatRow {
  id: string;
  fullName: string;
  status: string;
  lastSeenAt: string | null;
}

export interface DisclosureRow {
  clientUserId: string;
  documentVersion: string;
}

export type SeatGateState = 'ready' | 'blocked' | 'disabled';

export interface SeatStanding {
  id: string;
  fullName: string;
  state: SeatGateState;
  lastSeenAt: string | null;
}

/**
 * Whether each seat can currently get in.
 *
 * `blocked` is the one worth surfacing: an active seat that has not
 * acknowledged the *current* version. Acknowledging an older one does not
 * count, and that is the whole point — a superseded acknowledgement is a record
 * of agreeing to different words.
 *
 * With no active statement every active seat is blocked, which is correct
 * rather than alarmist: the gate serves the active document and there is none.
 */
export function seatStandings(
  seats: readonly SeatRow[],
  disclosures: readonly DisclosureRow[],
  activeVersion: string | null,
): SeatStanding[] {
  const acknowledged = new Set(
    disclosures
      .filter((row) => activeVersion !== null && row.documentVersion === activeVersion)
      .map((row) => row.clientUserId),
  );

  return seats.map((seat) => ({
    id: seat.id,
    fullName: seat.fullName,
    lastSeenAt: seat.lastSeenAt,
    state:
      seat.status !== 'active'
        ? 'disabled'
        : acknowledged.has(seat.id)
          ? 'ready'
          : 'blocked',
  }));
}

/** Seats that cannot use the app right now and are expected to be able to. */
export function blockedSeats(standings: readonly SeatStanding[]): SeatStanding[] {
  return standings.filter((seat) => seat.state === 'blocked');
}

/**
 * Days since anyone on the account last opened Minute.
 *
 * `null` when nobody ever has — a different state from "a long time ago", and
 * the one that means onboarding stalled rather than interest faded.
 */
export function daysSinceLastSeen(
  seats: readonly SeatRow[],
  now: Date = new Date(),
): number | null {
  const seen = seats
    .map((seat) => seat.lastSeenAt)
    .filter((at): at is string => at !== null)
    .map((at) => Date.parse(at))
    .filter((at) => !Number.isNaN(at));

  if (seen.length === 0) return null;

  return Math.floor((now.getTime() - Math.max(...seen)) / 86_400_000);
}

export type ActivityState = 'active' | 'quiet' | 'dormant' | 'never';

/**
 * How an account reads at a glance.
 *
 * Fourteen and forty-two days, which are not rules from anywhere. Two weeks is
 * long enough that a busy fortnight does not trip it; six is long enough that
 * calling it dormant is a statement rather than a guess.
 */
export function activityState(days: number | null): ActivityState {
  if (days === null) return 'never';
  if (days <= 14) return 'active';
  if (days <= 42) return 'quiet';
  return 'dormant';
}

export interface GenerationRow {
  accountId: string;
  templateId: string;
  templateVersion: string;
  event: string;
  generatedAt: string;
}

export interface BlastRadius {
  /** Distinct accounts that built something from this template version. */
  accounts: number;
  /** Packs created. `facts_refreshed` and `exported` are not new documents. */
  packs: number;
  lastGeneratedAt: string | null;
}

/**
 * Who received a given template version.
 *
 * Counts `created` only. A pack that was exported three times is one document
 * in one subscriber's hands, and counting the exports would overstate a recall
 * — which is the exact moment this number gets read, and the exact moment
 * overstating it sends someone chasing packs that do not exist.
 */
export function blastRadius(
  generations: readonly GenerationRow[],
  templateId: string,
  templateVersion?: string,
): BlastRadius {
  const matching = generations.filter(
    (row) =>
      row.templateId === templateId
      && row.event === 'created'
      && (templateVersion === undefined || row.templateVersion === templateVersion),
  );

  const times = matching.map((row) => row.generatedAt).sort();

  return {
    accounts: new Set(matching.map((row) => row.accountId)).size,
    packs: matching.length,
    lastGeneratedAt: times.length > 0 ? times[times.length - 1]! : null,
  };
}
