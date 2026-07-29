import { describe, it, expect } from 'vitest';
import { scoreMateriality, severityBand, recencyFactor, RUBRIC_VERSION } from './materiality.js';

const NOW = new Date('2026-07-29T00:00:00Z');

function score(overrides: Partial<Parameters<typeof scoreMateriality>[0]> = {}) {
  return scoreMateriality({
    changeType: 'release',
    payload: {},
    occurredAt: NOW.toISOString(),
    centrality: 1,
    now: NOW,
    ...overrides,
  } as Parameters<typeof scoreMateriality>[0]);
}

describe('recencyFactor', () => {
  it('holds full weight for a week, then decays to a floor', () => {
    expect(recencyFactor(NOW.toISOString(), NOW)).toBe(1);
    expect(recencyFactor('2026-07-25T00:00:00Z', NOW)).toBe(1);
    expect(recencyFactor('2026-01-01T00:00:00Z', NOW)).toBe(0.6);
  });

  it('does not penalise a change whose source carried no date', () => {
    expect(recencyFactor(null, NOW)).toBe(1);
    expect(recencyFactor('not-a-date', NOW)).toBe(1);
  });
});

describe('scoreMateriality', () => {
  it('ranks a regulatory change above a routine release', () => {
    expect(score({ changeType: 'regulatory_change' })).toBeGreaterThan(score({ changeType: 'release' }));
  });

  it('ranks a mention at the bottom', () => {
    const mention = score({ changeType: 'mention' });
    for (const type of ['release', 'advisory', 'incident', 'staleness'] as const) {
      expect(mention).toBeLessThan(score({ changeType: type }));
    }
  });

  it('lifts a change the publisher rated critical', () => {
    const critical = score({ changeType: 'advisory', payload: { severity: 'critical' } });
    const low = score({ changeType: 'advisory', payload: { severity: 'low' } });

    expect(critical).toBeGreaterThan(low);
  });

  it('scales staleness by how many cadences have been missed', () => {
    const slightlyLate = score({
      changeType: 'staleness',
      payload: { days_overdue: 5, expected_cadence_days: 90 },
    });
    const badlyLate = score({
      changeType: 'staleness',
      payload: { days_overdue: 311, expected_cadence_days: 90 },
    });

    expect(badlyLate).toBeGreaterThan(slightlyLate);
  });

  it('applies the watch weighting', () => {
    expect(score({ centrality: 1.5 })).toBeGreaterThan(score({ centrality: 1 }));
    expect(score({ centrality: 0.5 })).toBeLessThan(score({ centrality: 1 }));
  });

  it('stays inside 0-100 even when every factor stacks', () => {
    const maxed = score({
      changeType: 'regulatory_change',
      payload: { severity: 'critical' },
      centrality: 2,
    });

    expect(maxed).toBeLessThanOrEqual(100);
    expect(maxed).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic — the same input scores the same twice', () => {
    const input = {
      changeType: 'advisory' as const,
      payload: { severity: 'high' },
      occurredAt: '2026-07-20T00:00:00Z',
      centrality: 1.2,
      now: NOW,
    };

    expect(scoreMateriality(input)).toBe(scoreMateriality(input));
  });

  it('stamps a rubric version so a scoring change is traceable', () => {
    expect(RUBRIC_VERSION).toBeTruthy();
  });
});

describe('severityBand', () => {
  it('lets a publisher-declared critical win over a low score', () => {
    // A vendor calling an advisory critical is a fact. It should not be softened
    // because we happen to weight that entity low.
    expect(severityBand({ severity: 'critical' }, 10)).toBe('critical');
    expect(severityBand({ severity: 'high' }, 10)).toBe('high');
  });

  it('bands by score when the source declared nothing', () => {
    expect(severityBand({}, 90)).toBe('critical');
    expect(severityBand({}, 70)).toBe('high');
    expect(severityBand({}, 50)).toBe('medium');
    expect(severityBand({}, 25)).toBe('low');
    expect(severityBand({}, 5)).toBe('info');
  });
});
