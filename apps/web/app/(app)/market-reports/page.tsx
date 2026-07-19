import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import styles from './market-reports.module.css';

// Latest daily market reports — the durable record of what the findings engine
// narrated (or withheld) each day. The detail page carries the feedback box.

const STATUS_LABEL: Record<string, string> = {
  published: 'Published',
  held: 'Held',
  error: 'No narration',
};

type ReportRow = {
  id: string;
  as_of: string;
  status: string;
  report_mode: string;
  narration_markdown: string | null;
  emailed: boolean;
};

function formatAsOf(asOf: string): string {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${asOf}T00:00:00Z`),
  );
}

export default async function MarketReportsPage() {
  const supabase = await createClient();
  // market_reports is not in the generated Database types yet — cast to bypass
  // typing (same pattern as the content pages).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data } = await db
    .from('market_reports')
    .select('id, as_of, status, report_mode, narration_markdown, emailed')
    .order('as_of', { ascending: false })
    .limit(30);
  const reports = (data ?? []) as ReportRow[];

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
                  <span className={styles.rowDate}>{formatAsOf(report.as_of)}</span>
                  {report.narration_markdown && (
                    <span className={styles.rowExcerpt}>{report.narration_markdown}</span>
                  )}
                </div>
                <span className={styles.chips}>
                  {report.report_mode === 'quiet' && <span className={styles.chip}>Quiet day</span>}
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
