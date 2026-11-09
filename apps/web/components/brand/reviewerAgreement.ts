// The founder's image picks against the reviewer's top pick, from
// v_image_pick_agreement. Pure: the panel renders what this returns.
//
// The point is evidence for a later decision. If the founder keeps choosing
// differently, the averages show which way: picks that score higher on
// recognisable and lower on on_hook mean the reviewer weights the hook too
// heavily. Nothing here changes the reviewer.

/** One decided candidate set, as v_image_pick_agreement returns it. */
export interface PickAgreementRow {
  candidate_set_id: string | null;
  created_at: string | null;
  picked_symbol: string | null;
  picked_recognisable: number | null;
  picked_twist_visible: number | null;
  picked_on_hook: number | null;
  top_symbol: string | null;
  top_recognisable: number | null;
  top_twist_visible: number | null;
  top_on_hook: number | null;
  /** Null when either the pick or the set had no reviewer verdict. */
  agreed: boolean | null;
}

/** How many decided runs the panel needs before it says anything. */
export const MIN_DECIDED_RUNS = 5;
/** How many recent overrides the panel lists. */
export const RECENT_OVERRIDES = 5;

export interface ScoreAverages {
  recognisable: number | null;
  twist_visible: number | null;
  on_hook: number | null;
}

export interface AgreementSummary {
  /** Decided runs read. */
  decided: number;
  /** Runs with a verdict on both sides: the denominator. */
  judged: number;
  /** Runs where the pick was the reviewer's top pick. */
  matched: number;
  /** Averages over overrides only; null when there are none. */
  averages: { picked: ScoreAverages; top: ScoreAverages } | null;
  /** The most recent overrides, newest first. */
  recent: Array<{ id: string; date: string | null; picked: string; top: string }>;
}

function mean(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

/**
 * Summarise decided runs, newest first. A run whose agreed is null (a review
 * fallback, or the founder's own Edit brief render) counts toward neither side
 * of the agreement figure.
 */
export function summariseAgreement(rows: PickAgreementRow[]): AgreementSummary {
  const sorted = [...rows].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  const judged = sorted.filter((r) => r.agreed !== null);
  const overrides = judged.filter((r) => r.agreed === false);
  // Postgres NUMERIC can arrive as a string from PostgREST.
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    decided: sorted.length,
    judged: judged.length,
    matched: judged.filter((r) => r.agreed === true).length,
    averages:
      overrides.length === 0
        ? null
        : {
            picked: {
              recognisable: mean(overrides.map((r) => n(r.picked_recognisable))),
              twist_visible: mean(overrides.map((r) => n(r.picked_twist_visible))),
              on_hook: mean(overrides.map((r) => n(r.picked_on_hook))),
            },
            top: {
              recognisable: mean(overrides.map((r) => n(r.top_recognisable))),
              twist_visible: mean(overrides.map((r) => n(r.top_twist_visible))),
              on_hook: mean(overrides.map((r) => n(r.top_on_hook))),
            },
          },
    recent: overrides.slice(0, RECENT_OVERRIDES).map((r, i) => ({
      id: r.candidate_set_id ?? `override-${i}`,
      date: r.created_at,
      picked: r.picked_symbol ?? 'Untitled image',
      top: r.top_symbol ?? 'Untitled image',
    })),
  };
}
