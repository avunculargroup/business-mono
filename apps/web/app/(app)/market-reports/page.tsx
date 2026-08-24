import Link from 'next/link';
import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { PageHeader } from '@/components/app-shell/PageHeader';
import styles from './market-reports.module.css';

// Latest daily market reports — the durable record of what the findings engine
// narrated (or withheld) each day. The detail page carries the feedback box.

const STATUS_LABEL: Record<string, string> = {
  published: 'Published',
  held: 'Held',
  error: 'No narration',
};

function formatAsOf(asOf: string): string {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${asOf}T00:00:00Z`),
  );
}

export default async function MarketReportsPage() {
  const repositories = await getRepositories();
  const { items: reports } = await repositories.marketReports.listReports(resolveReadContext());

  return (
    <>
      <PageHeader title="Market reports" />
      {reports.length === 0 ? (
        <p className={styles.empty}>No reports yet. The daily market report routine writes one each morning.</p>
      ) : (
        <ul className={styles.list}>
          {reports.map((report) => (
            <li key={report.id}>
              <Link href={`/market-reports/${report.id}`} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowDate}>{formatAsOf(report.asOf)}</span>
                  {report.narrationMarkdown && (
                    <span className={styles.rowExcerpt}>{report.narrationMarkdown}</span>
                  )}
                </div>
                <span className={styles.chips}>
                  {report.isQuietDay && <span className={styles.chip}>Quiet day</span>}
                  <span className={styles.chip} data-status={report.status}>
                    {STATUS_LABEL[report.status] ?? report.status}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
