import { notFound } from 'next/navigation';
import { getRepositories, demoReadContext } from '@/lib/repositories';
import { Page } from '@/components/Page';
import styles from '@/components/Page.module.css';

export default async function MarketReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { marketReports } = getRepositories();
  const report = await marketReports.getReport(demoReadContext(), id);

  if (!report) notFound();

  return (
    <Page
      title={`Market report — ${report.asOf}`}
      lede="The boundary this page exists to show runs between the two sections below."
    >
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Narration</h2>
        <p className={styles.prose}>
          {report.narrationMarkdown ??
            (report.isQuietDay
              ? 'Nothing cleared the materiality floor, so no narration was written.'
              : 'No narration was produced for this report.')}
        </p>
      </section>

      {/* The annotated element is the heading of the findings block, because
          the claim is about what sits on each side of it: everything below was
          computed and committed before the narration above was generated. */}
      <h2
        className={styles.sectionHeading}
        data-annotation-id="findings-boundary"
      >
        Findings — computed before the narration
      </h2>

      {report.findings.length === 0 ? (
        <p className={styles.empty}>No findings were computed for this report.</p>
      ) : (
        <div className={styles.grid}>
          {report.findings.map((finding) => (
            <article key={finding.id} className={styles.card}>
              <div className={styles.cardTitle}>{finding.metric_key}</div>
              <div className={styles.meta}>
                <span>{finding.finding_type}</span>
                <span className={styles.mono}>observed {finding.observed}</span>
                <span className={styles.mono}>
                  materiality {finding.materiality.toFixed(2)}
                </span>
                <span className={styles.mono}>
                  unusualness {finding.unusualness.toFixed(2)}
                </span>
                <span>{finding.compliance_class}</span>
              </div>
              <p className={styles.body}>{finding.narration_hint.means}</p>
              {/* Stated plainly rather than inferred from the prose. Whether a
                  conclusion is permitted is a property the engine computed, and
                  a reader should be able to check the narration against it. */}
              <p className={styles.body}>
                {finding.narration_hint.verdict_allowed
                  ? 'A conclusion is permitted from this finding.'
                  : 'No conclusion permitted — reportable as a watch-item only.'}
              </p>
            </article>
          ))}
        </div>
      )}

      {report.priorFeedback.length > 0 ? (
        <>
          <h2 className={styles.sectionHeading}>Feedback</h2>
          <div className={styles.grid}>
            {report.priorFeedback.map((entry) => (
              <article key={entry.id} className={styles.card}>
                <div className={styles.meta}>
                  <span>{entry.verdict ?? 'note'}</span>
                </div>
                <p className={styles.body}>{entry.feedback}</p>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </Page>
  );
}
