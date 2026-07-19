import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ReportFeedback, type ReportFeedbackEntry } from '@/components/market-reports/ReportFeedback';
import styles from '../market-reports.module.css';

// One day's market report: the narration (or why it was withheld), the
// deterministic findings behind it, and the feedback box that shapes future
// narrations. Linked from the report email's "Review this report".

const STATUS_LABEL: Record<string, string> = {
  published: 'Published',
  held: 'Held — narration withheld from the email',
  error: 'No narration was produced',
};

type FindingRow = {
  id: string;
  finding_type: string;
  metric_key: string;
  observed: number;
  materiality: number;
  compliance_class: string;
  narration_hint?: { means?: string };
};

function formatAsOf(asOf: string): string {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${asOf}T00:00:00Z`),
  );
}

export default async function MarketReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  // market_reports / market_report_feedback are not in the generated Database
  // types yet — cast to bypass typing (same pattern as the content pages).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: report } = await db.from('market_reports').select('*').eq('id', id).single();
  if (!report) notFound();

  const { data: priorFeedback } = await db
    .from('market_report_feedback')
    .select('id, verdict, feedback, created_at')
    .eq('market_report_id', report.id)
    .order('created_at', { ascending: false });

  const findings = (Array.isArray(report.findings) ? report.findings : []) as FindingRow[];
  const paragraphs: string[] = report.narration_markdown
    ? String(report.narration_markdown).split(/\n{2,}/).filter((p: string) => p.trim())
    : [];

  return (
    <>
      <PageHeader title={`Market report — ${formatAsOf(report.as_of)}`} backHref="/market-reports" />
      <div className={styles.detail}>
        <div className={styles.meta}>
          {report.report_mode === 'quiet' && <span className={styles.chip}>Quiet day</span>}
          <span className={styles.chip} data-status={report.status}>
            {STATUS_LABEL[report.status] ?? report.status}
          </span>
        </div>

        {paragraphs.length > 0 ? (
          <div className={styles.narration}>
            {paragraphs.map((p, i) => (
              <p key={i}>{p.trim()}</p>
            ))}
          </div>
        ) : (
          <p className={styles.heldNote}>The report email was sent without a commentary this day.</p>
        )}
        {report.status === 'held' && paragraphs.length > 0 && (
          <p className={styles.heldNote}>
            This commentary did not pass review and was not included in the report email.
          </p>
        )}

        {findings.length > 0 && (
          <div>
            <span className={styles.sectionLabel}>Findings behind this report</span>
            <ul className={styles.findings}>
              {findings.map((finding) => (
                <li key={finding.id} className={styles.finding}>
                  <span className={styles.findingHead}>
                    <span className={styles.findingType}>{finding.finding_type}</span>
                    <span className={styles.findingMetric}>{finding.metric_key}</span>
                  </span>
                  {finding.narration_hint?.means && (
                    <p className={styles.findingMeans}>{finding.narration_hint.means}</p>
                  )}
                  <span className={styles.findingMeta}>
                    materiality {Number(finding.materiality).toFixed(2)}
                    {finding.compliance_class === 'valuation_sensitive' ? ' · valuation-sensitive' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ReportFeedback
          marketReportId={report.id}
          priorFeedback={(priorFeedback ?? []) as ReportFeedbackEntry[]}
        />

        <p className={styles.disclaimer}>
          General information only. It is not financial advice and does not consider your objectives, financial
          situation or needs.
        </p>
      </div>
    </>
  );
}
