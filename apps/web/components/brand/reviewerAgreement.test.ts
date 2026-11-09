import { describe, it, expect } from 'vitest';
import { summariseAgreement, type PickAgreementRow } from './reviewerAgreement';

function row(overrides: Partial<PickAgreementRow> = {}): PickAgreementRow {
  return {
    candidate_set_id: 'set',
    created_at: '2026-11-09T04:53:39Z',
    picked_symbol: 'A football pitch',
    picked_recognisable: 5,
    picked_twist_visible: 4,
    picked_on_hook: 4,
    top_symbol: "An architect's blueprint tube",
    top_recognisable: 4,
    top_twist_visible: 4,
    top_on_hook: 5,
    agreed: false,
    ...overrides,
  };
}

describe('summariseAgreement', () => {
  it('counts agreement only over runs with a verdict on both sides', () => {
    const s = summariseAgreement([
      row({ candidate_set_id: 'a', agreed: true }),
      row({ candidate_set_id: 'b', agreed: false }),
      row({ candidate_set_id: 'c', agreed: null }),
      row({ candidate_set_id: 'd', agreed: true }),
    ]);
    expect(s).toMatchObject({ decided: 4, judged: 3, matched: 2 });
  });

  it('averages the scores over overrides only, skipping missing scores', () => {
    const s = summariseAgreement([
      row({ candidate_set_id: 'match', agreed: true, picked_recognisable: 1, top_recognisable: 1 }),
      row({ candidate_set_id: 'o1', picked_recognisable: 5, picked_on_hook: 3, top_recognisable: 4, top_on_hook: 5 }),
      row({ candidate_set_id: 'o2', picked_recognisable: 4, picked_on_hook: null, top_recognisable: 3, top_on_hook: 4 }),
      row({ candidate_set_id: 'fallback', agreed: null, picked_recognisable: 1 }),
    ]);
    expect(s.averages).toEqual({
      picked: { recognisable: 4.5, twist_visible: 4, on_hook: 3 },
      top: { recognisable: 3.5, twist_visible: 4, on_hook: 4.5 },
    });
  });

  it('reads NUMERIC scores that arrive as strings', () => {
    const s = summariseAgreement([row({ picked_recognisable: '5' as unknown as number, top_recognisable: '3' as unknown as number })]);
    expect(s.averages?.picked.recognisable).toBe(5);
    expect(s.averages?.top.recognisable).toBe(3);
  });

  it('has no averages when every judged pick matched', () => {
    expect(summariseAgreement([row({ agreed: true })]).averages).toBeNull();
  });

  it('lists the five most recent overrides, newest first', () => {
    const rows = Array.from({ length: 7 }, (_, i) =>
      row({ candidate_set_id: `s${i}`, created_at: `2026-11-0${i + 1}T00:00:00Z`, picked_symbol: `Pick ${i}` }),
    );
    const s = summariseAgreement(rows);
    expect(s.recent.map((r) => r.picked)).toEqual(['Pick 6', 'Pick 5', 'Pick 4', 'Pick 3', 'Pick 2']);
  });
});
