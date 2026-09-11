import type { Metadata } from 'next';
import type { Brief, Finding } from '@platform/data';
import { EmptyDay } from '@/components/EmptyDay';
import { Markdown } from '@/components/Markdown';
import { requireClientRepositories, readContext } from '@/lib/repositories';
import page from '@/components/Page.module.css';
import styles from './brief.module.css';

export const metadata: Metadata = { title: 'The Brief' };

/**
 * The Brief — the habit surface.
 *
 * Three states, and they are genuinely three rather than two:
 *
 *   no brief      nothing has ever published. A new account on day one.
 *   quiet day     a brief published and said nothing cleared the floor.
 *   populated     a brief published with findings under it.
 *
 * Collapsing the first two would tell a subscriber "nothing happened today" on
 * a day when the pipeline simply had not run, which is a different and much
 * worse statement. The repository keeps them apart — `null` versus
 * `isQuietDay` — so the page can too.
 */
export default async function BriefPage() {
  const repositories = await requireClientRepositories();
  const ctx = readContext();

  const [brief, recent] = await Promise.all([
    repositories.brief.latest(ctx),
    repositories.brief.recent(ctx, 7),
  ]);

  return (
    <>
      <header className={page.header}>
        <h1 className={page.title}>The Brief</h1>
        <p className={page.lede}>
          What changed in the landscape, narrated and sourced. Findings clear a materiality
          floor before they appear here; on a day when nothing does, this page says so.
        </p>
      </header>

      {brief === null ? (
        <EmptyDay
          headline="No brief has published yet"
          detail={
            'This is not a quiet day — it is an empty one. Nothing has been published to your '
            + 'account so far. The first brief will appear here.'
          }
        />
      ) : brief.isQuietDay ? (
        <EmptyDay
          headline="Nothing cleared the materiality floor"
          detail={
            brief.narration
            || 'No movement in the monitored series or registers was material enough to report. '
              + 'That is a finding in itself, and it is the most common one.'
          }
          asAt={brief.publishedAt}
        />
      ) : (
        <PopulatedBrief brief={brief} />
      )}

      <RecentDays briefs={recent} currentId={brief?.id} />
    </>
  );
}

function PopulatedBrief({ brief }: { brief: Brief }) {
  return (
    <>
      <section className={styles.narration} aria-label="Narration">
        <Markdown>{brief.narration}</Markdown>
      </section>

      {brief.findings.length > 0 ? (
        <section aria-labelledby="findings-heading">
          <h2 id="findings-heading" className={page.sectionTitle}>
            Findings
          </h2>
          <ul className={styles.findings}>
            {brief.findings.map((finding) => (
              <FindingRow key={finding.id} finding={finding} />
            ))}
          </ul>
        </section>
      ) : (
        /* Narration without findings. Unusual, and stated rather than hidden —
           a reader should be able to tell that the rows are absent from the
           data rather than from the page. */
        <p className={page.lede}>
          This brief carries narration without individual findings attached.
        </p>
      )}
    </>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  return (
    <li className={styles.finding}>
      <div className={styles.findingHead}>
        {/* The type as a neutral label. Never coloured by direction — a
            threshold crossing is an event, not news. */}
        <span className={styles.type}>{finding.findingType}</span>
        <h3 className={styles.headline}>{finding.headline}</h3>
      </div>

      <p className={styles.detail}>{finding.detail}</p>

      <div className={styles.rail}>
        <span>
          As at <span className="mono">{finding.asAt || 'not stated'}</span>
        </span>
        {finding.provenance.length === 0 ? (
          /* Absence is a fact. A finding with no source says so rather than
             rendering an empty rail that reads as "no rail needed". */
          <span>Source not attached</span>
        ) : (
          finding.provenance.map((source, index) => (
            <span key={`${finding.id}-p${index}`}>
              {source.sourceUrl ? (
                <a href={source.sourceUrl} target="_blank" rel="noreferrer noopener">
                  {source.sourceName}
                </a>
              ) : (
                source.sourceName
              )}
              {' · '}
              {source.basis}
            </span>
          ))
        )}
      </div>
    </li>
  );
}

/**
 * The last seven days, collapsed.
 *
 * Below the fold and behind a disclosure, per the spec. Quiet days are listed
 * rather than filtered out: a run of them is information, and a list that hides
 * them would make the week look busier than it was.
 */
function RecentDays({ briefs, currentId }: { briefs: Brief[]; currentId?: string }) {
  const earlier = briefs.filter((brief) => brief.id !== currentId);

  if (earlier.length === 0) return null;

  return (
    <section className={styles.recent}>
      <details>
        <summary className={styles.summary}>The last seven days ({earlier.length})</summary>
        <ul className={styles.recentList}>
          {earlier.map((brief) => (
            <li key={brief.id} className={styles.recentItem}>
              <span className={styles.recentDate}>{brief.publishedAt}</span>
              {brief.isQuietDay ? (
                <span className={styles.quietTag}>Quiet day</span>
              ) : (
                <span className={styles.recentSummary}>
                  {brief.findings.length}{' '}
                  {brief.findings.length === 1 ? 'finding' : 'findings'}
                </span>
              )}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
