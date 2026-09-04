import { describe, it, expect } from 'vitest';
import {
  isQuietRun,
  materialDeltas,
  reconcile,
  relativeChange,
  type CandidateEvent,
  type CommittedEvent,
} from './reconcile.js';

const acquisition: CandidateEvent = {
  event_type: 'acquisition',
  event_date: '2025-06-04',
  quantity: 6.08914,
  consideration_native: 1000000,
  natural_key: 'loc:acq:2025-06-04',
};

const committed: CommittedEvent = {
  natural_key: 'loc:acq:2025-06-04',
  quantity: 6.08914,
  consideration_native: 1000000,
};

describe('relativeChange', () => {
  it('measures against the prior figure, not the new one', () => {
    expect(relativeChange(100, 110)).toBeCloseTo(0.1, 10);
  });

  it('has no denominator for a first disclosure', () => {
    // 0 to 12.3 is not a 100% change, it is the first figure. Returning null
    // makes the caller treat it as material for the right reason.
    expect(relativeChange(0, 12.3)).toBeNull();
    expect(relativeChange(null, 12.3)).toBeNull();
  });
});

describe('reconcile', () => {
  it('treats an event with no committed counterpart as created', () => {
    const result = reconcile([acquisition], []);

    expect(result.created).toHaveLength(1);
    expect(result.restated).toHaveLength(0);
    expect(result.deltas).toHaveLength(0);
  });

  it('produces nothing at all when re-ingesting the same document', () => {
    // The session 2 acceptance criterion, at the reconciliation layer: an
    // unchanged event yields no delta, so no finding, so nothing to narrate.
    const result = reconcile([acquisition], [committed]);

    expect(result.unchanged).toHaveLength(1);
    expect(result.created).toHaveLength(0);
    expect(result.deltas).toHaveLength(0);
    expect(isQuietRun(result)).toBe(true);
  });

  it('suppresses the administrative restatement the floor was calibrated on', () => {
    // Shares on issue restated by 90,539 against 307,378,078 — 0.03%, because
    // buyback shares were not yet cancelled on the register.
    const prior: CommittedEvent = {
      natural_key: 'loc:raise:2026-07-01',
      quantity: 307378078,
      consideration_native: null,
    };
    const revised: CandidateEvent = {
      event_type: 'capital_raise',
      event_date: '2026-07-01',
      quantity: 307287539,
      natural_key: 'loc:raise:2026-07-01',
    };

    const result = reconcile([revised], [prior]);

    expect(result.deltas).toHaveLength(1);
    expect(result.deltas[0].relative).toBeLessThan(0.005);
    expect(result.deltas[0].suppressed).toBe(true);
    expect(materialDeltas(result)).toHaveLength(0);
  });

  it('stores the suppressed delta rather than dropping it', () => {
    // "We looked and it was immaterial" is a different claim from "we did not
    // look", and only the stored row distinguishes them.
    const prior: CommittedEvent = {
      natural_key: 'k',
      quantity: 307378078,
      consideration_native: null,
    };
    const revised: CandidateEvent = {
      event_type: 'capital_raise',
      event_date: '2026-07-01',
      quantity: 307287539,
      natural_key: 'k',
    };

    const result = reconcile([revised], [prior]);

    expect(result.deltas[0].reason).toContain('materiality floor');
    expect(result.deltas[0].from).toBe(307378078);
    expect(result.deltas[0].to).toBe(307287539);
  });

  it('reports a holdings change that clears the floor', () => {
    const prior: CommittedEvent = { natural_key: 'k', quantity: 10.1, consideration_native: null };
    const revised: CandidateEvent = {
      event_type: 'acquisition',
      event_date: '2025-07-30',
      quantity: 12.3,
      natural_key: 'k',
    };

    const result = reconcile([revised], [prior]);

    expect(result.deltas[0].suppressed).toBe(false);
    expect(materialDeltas(result)).toHaveLength(1);
    expect(isQuietRun(result)).toBe(false);
  });

  it('never suppresses a first figure', () => {
    const prior: CommittedEvent = { natural_key: 'k', quantity: 0, consideration_native: null };
    const revised: CandidateEvent = {
      event_type: 'acquisition',
      event_date: '2025-06-04',
      quantity: 6.08914,
      natural_key: 'k',
    };

    const result = reconcile([revised], [prior]);

    expect(result.deltas[0].relative).toBeNull();
    expect(result.deltas[0].suppressed).toBe(false);
  });

  it('reports a quiet run as quiet rather than as a failure', () => {
    // Most weeks nothing happens. A pipeline that cannot say so ends up
    // manufacturing something to say.
    expect(isQuietRun(reconcile([], []))).toBe(true);
  });
});
