import { describe, expect, it } from 'vitest';
import {
  activityState,
  blastRadius,
  blockedSeats,
  daysSinceLastSeen,
  seatStandings,
  type GenerationRow,
  type SeatRow,
} from './operations';

function seat(overrides: Partial<SeatRow> = {}): SeatRow {
  return { id: 'u1', fullName: 'A Person', status: 'active', lastSeenAt: null, ...overrides };
}

describe('seatStandings', () => {
  it('is ready when the seat acknowledged the current version', () => {
    const [standing] = seatStandings(
      [seat()],
      [{ clientUserId: 'u1', documentVersion: '1.0' }],
      '1.0',
    );

    expect(standing!.state).toBe('ready');
  });

  it('is blocked when the seat only acknowledged an older version', () => {
    // The whole reason this module exists. A superseded acknowledgement is a
    // record of agreeing to different words, and publishing 1.1 puts everyone
    // who agreed to 1.0 back at the gate.
    const [standing] = seatStandings(
      [seat()],
      [{ clientUserId: 'u1', documentVersion: '1.0' }],
      '1.1',
    );

    expect(standing!.state).toBe('blocked');
  });

  it('is blocked when the seat has acknowledged nothing', () => {
    expect(seatStandings([seat()], [], '1.0')[0]!.state).toBe('blocked');
  });

  it('blocks every active seat when no statement is active', () => {
    // Correct rather than alarmist: the gate serves the active document and
    // there is none, so nobody can pass.
    expect(seatStandings([seat()], [{ clientUserId: 'u1', documentVersion: '1.0' }], null)[0]!.state)
      .toBe('blocked');
  });

  it('reports a disabled seat as disabled, not as blocked', () => {
    // A disabled seat is not waiting on anything, and listing it as blocked
    // would send someone chasing an acknowledgement that is not the problem.
    const [standing] = seatStandings([seat({ status: 'disabled' })], [], '1.0');

    expect(standing!.state).toBe('disabled');
  });

  it('does not credit one seat with another seat’s acknowledgement', () => {
    const standings = seatStandings(
      [seat({ id: 'u1' }), seat({ id: 'u2', fullName: 'B Person' })],
      [{ clientUserId: 'u1', documentVersion: '1.0' }],
      '1.0',
    );

    expect(standings.map((s) => s.state)).toEqual(['ready', 'blocked']);
  });
});

describe('blockedSeats', () => {
  it('returns only the seats that are stuck', () => {
    const standings = seatStandings(
      [seat({ id: 'u1' }), seat({ id: 'u2' }), seat({ id: 'u3', status: 'disabled' })],
      [{ clientUserId: 'u1', documentVersion: '1.0' }],
      '1.0',
    );

    expect(blockedSeats(standings).map((s) => s.id)).toEqual(['u2']);
  });
});

describe('daysSinceLastSeen', () => {
  const now = new Date('2026-09-12T00:00:00Z');

  it('measures from the most recent seat, not the first', () => {
    const days = daysSinceLastSeen(
      [
        seat({ id: 'u1', lastSeenAt: '2026-01-01T00:00:00Z' }),
        seat({ id: 'u2', lastSeenAt: '2026-09-10T00:00:00Z' }),
      ],
      now,
    );

    expect(days).toBe(2);
  });

  it('is null when nobody has ever opened it', () => {
    // A different state from "a long time ago": it means onboarding stalled
    // rather than interest faded.
    expect(daysSinceLastSeen([seat()], now)).toBeNull();
  });

  it('ignores an unparseable timestamp rather than returning NaN', () => {
    expect(daysSinceLastSeen([seat({ lastSeenAt: 'never' })], now)).toBeNull();
  });
});

describe('activityState', () => {
  it('separates never from dormant', () => {
    expect(activityState(null)).toBe('never');
    expect(activityState(400)).toBe('dormant');
  });

  it('does not trip on a busy fortnight', () => {
    expect(activityState(14)).toBe('active');
    expect(activityState(15)).toBe('quiet');
    expect(activityState(42)).toBe('quiet');
    expect(activityState(43)).toBe('dormant');
  });
});

describe('blastRadius', () => {
  function gen(overrides: Partial<GenerationRow> = {}): GenerationRow {
    return {
      accountId: 'a1',
      templateId: 't1',
      templateVersion: '1.0',
      event: 'created',
      generatedAt: '2026-09-01T00:00:00Z',
      ...overrides,
    };
  }

  it('counts distinct accounts and packs', () => {
    const radius = blastRadius(
      [gen(), gen({ accountId: 'a2' }), gen({ accountId: 'a2' })],
      't1',
    );

    expect(radius).toMatchObject({ accounts: 2, packs: 3 });
  });

  it('counts created only, so a recall is not overstated', () => {
    // A pack exported three times is one document in one subscriber's hands.
    // Overstating it sends someone chasing packs that do not exist, at exactly
    // the moment this number is being read in earnest.
    const radius = blastRadius(
      [gen(), gen({ event: 'exported' }), gen({ event: 'facts_refreshed' })],
      't1',
    );

    expect(radius.packs).toBe(1);
  });

  it('narrows to one version when asked', () => {
    const radius = blastRadius([gen(), gen({ templateVersion: '1.1' })], 't1', '1.1');

    expect(radius.packs).toBe(1);
  });

  it('counts every version when not', () => {
    expect(blastRadius([gen(), gen({ templateVersion: '1.1' })], 't1').packs).toBe(2);
  });

  it('ignores other templates', () => {
    expect(blastRadius([gen({ templateId: 't2' })], 't1').packs).toBe(0);
  });

  it('reports the most recent generation, not the first', () => {
    const radius = blastRadius(
      [gen({ generatedAt: '2026-01-01T00:00:00Z' }), gen({ generatedAt: '2026-09-01T00:00:00Z' })],
      't1',
    );

    expect(radius.lastGeneratedAt).toBe('2026-09-01T00:00:00Z');
  });

  it('is zero and null for a template nobody has used', () => {
    expect(blastRadius([], 't1')).toEqual({ accounts: 0, packs: 0, lastGeneratedAt: null });
  });
});
