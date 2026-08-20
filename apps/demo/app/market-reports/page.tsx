import { getRepositories, demoReadContext } from '@/lib/repositories';
import { Page } from '@/components/Page';
import styles from '@/components/Page.module.css';

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
              <span>{report.isQuietDay ? 'Quiet day' : 'Findings cleared the floor'}</span>
              <span>{report.emailed ? 'Emailed' : 'Not emailed'}</span>
            </div>
            <p className={styles.body}>
              {report.narrationMarkdown ?? 'No narration — nothing met the materiality floor.'}
            </p>
          </article>
        ))}
      </div>
    </Page>
  );
}
