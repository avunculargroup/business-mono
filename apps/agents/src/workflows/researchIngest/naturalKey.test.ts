import { describe, it, expect } from 'vitest';
import { TreasuryEventType } from '@platform/shared';
import {
  EVENT_KEY_CODES,
  assignNaturalKeys,
  eventNaturalKey,
  isIsoDate,
  quantityDiscriminator,
} from './naturalKey.js';
import { isQuietRun, reconcile } from './reconcile.js';

const event = (overrides: Partial<{
  event_type: string;
  event_date: string;
  quantity: number | null;
  source_document_id: string;
}> = {}) => ({
  event_type: 'disposal',
  event_date: '2026-08-02',
  quantity: 1638,
  source_document_id: 'doc-1',
  ...overrides,
});

describe('eventNaturalKey', () => {
  it('builds the key from the slug, a fixed code and the ISO date', () => {
    expect(eventNaturalKey('strategy', 'disposal', '2026-08-02')).toBe('strategy:disp:2026-08-02');
  });

  it('reproduces every key the seeded Strategy ledger already carries', () => {
    // A first real run reconciles against these. A key that differs by one
    // character reconciles as new and duplicates the row.
    const seeded: Array<[string, string, string]> = [
      ['acquisition', '2020-08-11', 'strategy:acq:2020-08-11'],
      ['policy_adoption', '2026-06-29', 'strategy:policy:2026-06-29'],
      ['disposal', '2026-06-30', 'strategy:disp:2026-06-30'],
      ['capital_posture_change', '2026-09-08', 'strategy:posture:2026-09-08'],
    ];
    for (const [type, date, key] of seeded) {
      expect(eventNaturalKey('strategy', type, date)).toBe(key);
    }
  });

  it('has a code for every event type', () => {
    for (const type of Object.values(TreasuryEventType)) {
      expect(EVENT_KEY_CODES[type]).toMatch(/^[a-z]+$/);
    }
  });

  it('refuses a date that is not a real YYYY-MM-DD', () => {
    // Two seeded keys were month-only. A key built from "2026-05" cannot
    // match a DATE column, which stores the first of the month.
    expect(() => eventNaturalKey('sequans', 'capital_posture_change', '2026-05')).toThrow();
    expect(() => eventNaturalKey('strategy', 'disposal', '2026-02-30')).toThrow();
  });

  it('does not depend on how the model spells the company', () => {
    // Prefix drift: "mstr:disp:" and "strategy:disposal:" were the same sale.
    // The slug comes from the record, so there is only one spelling.
    const a = assignNaturalKeys('strategy', [event()]);
    const b = assignNaturalKeys('strategy', [event({ source_document_id: 'doc-2' })]);
    expect(a.keyed[0].natural_key).toBe(b.keyed[0].natural_key);
  });
});

describe('isIsoDate', () => {
  it('accepts a calendar date and rejects the shape of one', () => {
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2025-02-29')).toBe(false);
    expect(isIsoDate('29 June 2026')).toBe(false);
  });
});

describe('assignNaturalKeys', () => {
  it('collapses one event stated in two documents to one key', () => {
    const result = assignNaturalKeys('strategy', [
      event({ source_document_id: 'weekly-8k' }),
      event({ source_document_id: 'quarterly-10q' }),
    ]);

    expect(result.keyed).toHaveLength(1);
    expect(result.keyed[0].natural_key).toBe('strategy:disp:2026-08-02');
    expect(result.conflicts).toEqual([]);
  });

  it('tells apart two same-day events in one document', () => {
    // Metaplanet's restated table has dates carrying two rows. A date-only
    // key collapsed them, and one overwrote the other on persist.
    const result = assignNaturalKeys('metaplanet', [
      event({ event_type: 'acquisition', event_date: '2025-06-16', quantity: 1112 }),
      event({ event_type: 'acquisition', event_date: '2025-06-16', quantity: 1088 }),
    ]);

    const keys = result.keyed.map((row) => row.natural_key);
    expect(new Set(keys).size).toBe(2);
    for (const key of keys) expect(key.startsWith('metaplanet:acq:2025-06-16:')).toBe(true);
  });

  it('keeps two identical same-day events in one document as two', () => {
    const result = assignNaturalKeys('metaplanet', [
      event({ event_type: 'acquisition', quantity: 100 }),
      event({ event_type: 'acquisition', quantity: 100 }),
    ]);
    expect(result.keyed).toHaveLength(2);
  });

  it('gives a same-day pair the same keys whichever document restates it', () => {
    const pair = (doc: string) => [
      event({ event_type: 'acquisition', quantity: 1112, source_document_id: doc }),
      event({ event_type: 'acquisition', quantity: 1088, source_document_id: doc }),
    ];
    const first = assignNaturalKeys('metaplanet', pair('q2-notice'));
    const both = assignNaturalKeys('metaplanet', [...pair('q2-notice'), ...pair('q3-notice')]);

    expect(both.keyed.map((row) => row.natural_key).sort()).toEqual(
      first.keyed.map((row) => row.natural_key).sort(),
    );
  });

  it('reports two documents that disagree about one event, and keeps the last', () => {
    const result = assignNaturalKeys('strategy', [
      event({ quantity: 1638, source_document_id: 'weekly-8k' }),
      event({ quantity: 1639, source_document_id: 'amended-8k' }),
    ]);

    expect(result.keyed).toHaveLength(1);
    expect(result.keyed[0].quantity).toBe(1639);
    expect(result.conflicts).toEqual(['strategy:disp:2026-08-02']);
  });

  it('sets aside a candidate with no usable date rather than throwing', () => {
    const result = assignNaturalKeys('strategy', [event(), event({ event_date: 'June 29, 2026' })]);
    expect(result.keyed).toHaveLength(1);
    expect(result.invalid).toHaveLength(1);
  });

  it('hashes the quantity, not the document', () => {
    expect(quantityDiscriminator(1112)).toBe(quantityDiscriminator(1112));
    expect(quantityDiscriminator(1112)).not.toBe(quantityDiscriminator(1088));
    expect(quantityDiscriminator(null)).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('restatedLedgerIsIdempotent', () => {
  // The shape of a Metaplanet quarterly notice: the whole holdings history,
  // republished every quarter, including dates that carry two rows. The
  // quantities are illustrative; the shape is the real one.
  const history = Array.from({ length: 60 }, (_, index) => {
    const day = new Date(Date.UTC(2024, 3, 23) + index * 7 * 86_400_000);
    return {
      event_type: 'acquisition',
      event_date: day.toISOString().slice(0, 10),
      quantity: 100 + index,
      consideration_native: (100 + index) * 1_000_000,
    };
  });
  const sameDay = { ...history[10], quantity: 777, consideration_native: 777_000_000 };
  const notice = (doc: string) =>
    [...history, sameDay].map((row) => ({ ...row, source_document_id: doc }));

  it('commits nothing new the second time the same history is ingested', () => {
    const firstRun = assignNaturalKeys('metaplanet', notice('q1-notice'));
    expect(firstRun.keyed).toHaveLength(61);

    const committed = firstRun.keyed.map((row) => ({
      natural_key: row.natural_key,
      quantity: row.quantity,
      consideration_native: row.consideration_native,
    }));

    // The next quarter's notice restates all sixty-one rows, and the run reads
    // the previous notice again alongside it.
    const secondRun = assignNaturalKeys('metaplanet', [
      ...notice('q1-notice'),
      ...notice('q2-notice'),
    ]);
    const result = reconcile(secondRun.keyed, committed);

    expect(secondRun.keyed).toHaveLength(61);
    expect(result.created).toHaveLength(0);
    expect(result.unchanged).toHaveLength(61);
    expect(isQuietRun(result)).toBe(true);
  });
});
