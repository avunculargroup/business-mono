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

/**
 * How a provenance basis reads to a subscriber.
 *
 * The contract's three words are precise and none of them explains itself on a
 * card. "Derived" in particular has to say whose derivation it is: a figure
 * this platform computed from a provider's series is a different kind of claim
 * from one the provider published, and the rail is where that distinction is
 * either made or lost.
 */
const BASIS_LABEL: Record<Finding['provenance'][number]['basis'], string> = {
  reported: 'as published',
  observed: 'observed',
  derived: 'computed from this source',
};

function FindingRow({ finding }: { finding: Finding }) {
  return (
    <li className={styles.finding}>
      <div className={styles.findingHead}>
        {/* The type as a neutral label. Never coloured by direction — a
            threshold crossing is an event, not news. */}
        <span className={styles.type}>{finding.findingType}</span>
        <span className={styles.asAt}>
          As at <span className="mono">{finding.asAt || 'not stated'}</span>
        </span>
      </div>

      <h3 className={styles.headline}>
        {finding.headline || 'This finding was stored without a description'}
      </h3>

      {finding.detail ? <p className={styles.detail}>{finding.detail}</p> : null}

      {/* The measurement, not a sentence about it. A subscriber paying to be
          told what changed is owed the figure and the distribution it was
          judged against; without them the card is an assertion. */}
      {finding.evidence.length > 0 ? (
        <dl className={styles.evidence}>
          {finding.evidence.map((row, index) => (
            <div key={`${finding.id}-e${index}`} className={styles.evidenceRow}>
              <dt className={styles.evidenceLabel}>{row.label}</dt>
              <dd className={styles.evidenceValue}>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className={styles.rail}>
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
              {BASIS_LABEL[source.basis]}
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
                  {/* The first finding's own words, not a count. A row reading
                      "3 findings" tells a subscriber how much they missed
                      without telling them whether any of it mattered. */}
                  {brief.findings[0]?.headline || 'Narration only'}
                  {brief.findings.length > 1 ? (
                    <span className={styles.recentMore}>
                      {' '}
                      and {brief.findings.length - 1} more
                    </span>
                  ) : null}
                </span>
              )}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
