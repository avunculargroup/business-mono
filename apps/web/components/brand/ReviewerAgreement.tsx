import { formatDate } from '@/lib/utils';
import { MIN_DECIDED_RUNS, summariseAgreement, type PickAgreementRow, type ScoreAverages } from './reviewerAgreement';
import styles from './ReviewerAgreement.module.css';

const SCORES: Array<[keyof ScoreAverages, string]> = [
  ['recognisable', 'Recognisable'],
  ['twist_visible', 'Twist visible'],
  ['on_hook', 'On hook'],
];

const fmt = (v: number | null) => (v === null ? '–' : v.toFixed(1));

/**
 * Brand Hub → Visual: how often the founder's image pick matched the
 * reviewer's top pick, and how the scores differ when it did not. Read-only
 * evidence for a later decision about the reviewer's weighting.
 */
export function ReviewerAgreement({ rows }: { rows: PickAgreementRow[] }) {
  const summary = summariseAgreement(rows);

  return (
    <section className={styles.panel} aria-labelledby="reviewer-agreement-heading">
      <h2 id="reviewer-agreement-heading" className={styles.heading}>
        Reviewer agreement
      </h2>

      {summary.decided < MIN_DECIDED_RUNS ? (
        <p className={styles.empty}>Not enough picks yet. This fills in as you choose images in Review.</p>
      ) : (
        <>
          <p className={styles.lead}>
            Your pick matched the reviewer&rsquo;s top pick in <span className={styles.figure}>{summary.matched}</span> of{' '}
            <span className={styles.figure}>{summary.judged}</span> runs.
          </p>
          <p className={styles.hint}>
            Last {summary.decided} runs you decided. Runs the reviewer did not score are left out.
          </p>

          <h3 className={styles.subheading}>When you chose differently</h3>
          {summary.averages ? (
            <>
              <table className={styles.table}>
                <caption className={styles.caption}>Average scores out of 5</caption>
                <thead>
                  <tr>
                    <th scope="col">Score</th>
                    <th scope="col">Your picks</th>
                    <th scope="col">Reviewer&rsquo;s top picks</th>
                  </tr>
                </thead>
                <tbody>
                  {SCORES.map(([key, label]) => (
                    <tr key={key}>
                      <th scope="row">{label}</th>
                      <td className={styles.figure}>{fmt(summary.averages!.picked[key])}</td>
                      <td className={styles.figure}>{fmt(summary.averages!.top[key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <ul className={styles.overrides} aria-label="Recent runs where you chose differently">
                {summary.recent.map((o) => (
                  <li key={o.id} className={styles.override}>
                    {o.date && <span className={styles.date}>{formatDate(o.date)}</span>}
                    <span>
                      You chose <strong>{o.picked}</strong>; the reviewer ranked <strong>{o.top}</strong> first.
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className={styles.hint}>Every pick so far matched the reviewer&rsquo;s top pick.</p>
          )}
        </>
      )}
    </section>
  );
}
