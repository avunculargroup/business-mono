import type { MarketReportSummary } from '@platform/data';
import { getRepositories, demoReadContext } from '@/lib/repositories';
import { Page } from '@/components/Page';
import styles from '@/components/Page.module.css';

/**
 * What a report's day amounted to.
 *
 * Four states, not two. The first cut said
 * `isQuietDay ? 'Quiet day' : 'Findings cleared the floor'`, which labelled a
 * held report and a failed run as though findings had cleared — the opposite of
 * true in both cases, and wrong on the one surface whose whole claim is that
 * the system tells these apart. The placeholder fixtures had no held or errored
 * report in them, so nothing said so.
 */
function outcome(report: MarketReportSummary): string {
  if (report.status === 'error') return 'Pipeline failed';
  if (report.status === 'held') return 'Narration withheld';
  return report.isQuietDay ? 'Quiet day' : 'Findings cleared the floor';
}

function fallback(report: MarketReportSummary): string {
  if (report.status === 'error') return 'The run failed before producing a narration.';
  return 'No narration — nothing met the materiality floor.';
}

export default async function MarketReportsPage() {
  const { marketReports } = getRepositories();
  const { items } = await marketReports.listReports(demoReadContext());

  return (
    <Page
      title="Market reports"
      lede="Findings are computed deterministically and scored before any model sees them; the narration is written over that committed payload and nothing else. When nothing clears the materiality floor the day is marked quiet and there is no narration to write."
    >
      <div className={styles.grid}>
        {items.map((report) => (
          <article key={report.id} className={styles.card}>
            <div className={styles.cardTitle}>{report.asOf}</div>
            <div className={styles.meta}>
              <span>{report.status}</span>
              <span>{outcome(report)}</span>
              <span>{report.emailed ? 'Emailed' : 'Not emailed'}</span>
            </div>
            {/* Paragraph breaks carry meaning here — the narration separates one
                finding from the next — so the blank lines survive rather than
                collapsing into a wall. */}
            <p className={styles.prose}>{report.narrationMarkdown ?? fallback(report)}</p>
          </article>
        ))}
      </div>
    </Page>
  );
}
