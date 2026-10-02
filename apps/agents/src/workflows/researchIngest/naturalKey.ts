/**
 * The event `natural_key`, computed rather than asked for.
 *
 * Reconcile matches candidates to committed events by this key and creates
 * anything unmatched, so a key that varies between runs duplicates ledger rows.
 * It used to come from Rex, and three failure modes were already visible in the
 * records: prefix drift (`mstr:disp:…` against `strategy:disposal:…`), period
 * events keyed on either end of the period, and two same-day events in one
 * document collapsing into one key so one silently overwrote the other.
 *
 * So the model returns what it can see — type, date, quantity — and the key is
 * built here from the company slug on the record, a fixed code per event type
 * and the ISO date. Same idempotency guarantee, no model variance.
 *
 * Spec: docs/features/corporate-holdings/schema-ingest-spec.md#ingest-workflow
 */

import { createHash } from 'node:crypto';
import { TreasuryEventType } from '@platform/shared';

/**
 * One short code per event type. These are the codes the seeded keys already
 * use, so a first real run reconciles against them rather than duplicating
 * them. Changing one orphans every committed key that carries it.
 */
export const EVENT_KEY_CODES: Record<TreasuryEventType, string> = {
  [TreasuryEventType.POLICY_ADOPTION]: 'policy',
  [TreasuryEventType.ACQUISITION]: 'acq',
  [TreasuryEventType.DISPOSAL]: 'disp',
  [TreasuryEventType.CAPITAL_RAISE]: 'raise',
  [TreasuryEventType.COVENANT_CHANGE]: 'covenant',
  [TreasuryEventType.CAPITAL_POSTURE_CHANGE]: 'posture',
  [TreasuryEventType.CUSTODY_CHANGE]: 'custody',
  [TreasuryEventType.LISTING_CHANGE]: 'listing',
  [TreasuryEventType.ACCOUNTING_ELECTION]: 'accounting',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in YYYY-MM-DD, not just the shape of one. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** `<slug>:<code>:<YYYY-MM-DD>`, with a suffix only where a date alone is not unique. */
export function eventNaturalKey(
  slug: string,
  eventType: string,
  eventDate: string,
  discriminator?: string,
): string {
  const code = EVENT_KEY_CODES[eventType as TreasuryEventType];
  if (!code) throw new Error(`no key code for event type ${eventType}`);
  if (!isIsoDate(eventDate)) throw new Error(`event date ${eventDate} is not YYYY-MM-DD`);
  const base = `${slug}:${code}:${eventDate}`;
  return discriminator ? `${base}:${discriminator}` : base;
}

/**
 * A short, stable hash of the quantity.
 *
 * Quantity only, not the source document as the spec first had it: Metaplanet
 * republishes its whole history in every quarterly notice, so a key that
 * included the document would give the same purchase a new key in each one and
 * duplicate the ledger on every run — the failure this module exists to stop.
 */
export function quantityDiscriminator(quantity: number | null | undefined): string {
  const canonical = typeof quantity === 'number' ? String(quantity) : 'none';
  return createHash('sha256').update(canonical).digest('hex').slice(0, 8);
}

export interface KeyableEvent {
  event_type: string;
  event_date: string;
  quantity?: number | null;
  source_document_id: string;
}

export interface KeyAssignment<T> {
  /** One candidate per distinct event, each carrying its computed key. */
  keyed: Array<T & { natural_key: string }>;
  /** Candidates whose date is not a real YYYY-MM-DD. They cannot be keyed or stored. */
  invalid: T[];
  /**
   * Keys that two documents stated with different figures. The last candidate
   * is kept, and reconcile measures it against what is committed; logged
   * because a disagreement between filings is worth a human look.
   */
  conflicts: string[];
}

/**
 * Key every candidate and collapse restatements to one event each.
 *
 * The same type and date in two documents is one event stated twice — the
 * normal shape of a restating issuer — and collapses to the base key. Only when
 * a single document states several same-type events on one date are they told
 * apart, by quantity, plus an ordinal where the quantity repeats too. The count
 * per document is what decides it, because only within one document can two
 * rows be known to be two events rather than one event and its correction.
 */
export function assignNaturalKeys<T extends KeyableEvent>(
  slug: string,
  candidates: readonly T[],
): KeyAssignment<T> {
  const invalid: T[] = [];
  const groups = new Map<string, T[]>();

  for (const candidate of candidates) {
    if (!isIsoDate(candidate.event_date)) {
      invalid.push(candidate);
      continue;
    }
    const base = eventNaturalKey(slug, candidate.event_type, candidate.event_date);
    groups.set(base, [...(groups.get(base) ?? []), candidate]);
  }

  // A Map keeps the last write, which is the documented rule for a conflict.
  const byKey = new Map<string, T & { natural_key: string }>();
  const conflicts = new Set<string>();

  const keep = (key: string, candidate: T) => {
    const prior = byKey.get(key);
    if (prior && (prior.quantity ?? null) !== (candidate.quantity ?? null)) conflicts.add(key);
    byKey.set(key, { ...candidate, natural_key: key });
  };

  for (const [base, group] of groups) {
    const perDocument = new Map<string, T[]>();
    for (const candidate of group) {
      const id = candidate.source_document_id;
      perDocument.set(id, [...(perDocument.get(id) ?? []), candidate]);
    }

    const sameDayInOneDocument = Math.max(...[...perDocument.values()].map((rows) => rows.length));
    if (sameDayInOneDocument === 1) {
      for (const candidate of group) keep(base, candidate);
      continue;
    }

    for (const rows of perDocument.values()) {
      const seen = new Map<string, number>();
      for (const candidate of rows) {
        const hash = quantityDiscriminator(candidate.quantity);
        const ordinal = (seen.get(hash) ?? 0) + 1;
        seen.set(hash, ordinal);
        keep(`${base}:${ordinal === 1 ? hash : `${hash}-${ordinal}`}`, candidate);
      }
    }
  }

  return { keyed: [...byKey.values()], invalid, conflicts: [...conflicts] };
}
