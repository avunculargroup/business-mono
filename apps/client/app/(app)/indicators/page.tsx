import type { Metadata } from 'next';
import type { IndicatorSeries } from '@platform/data';
import { EmptyDay } from '@/components/EmptyDay';
import { Freshness } from '@/components/Freshness';
import { requireClientRepositories, readContext } from '@/lib/repositories';
import page from '@/components/Page.module.css';
import styles from './indicators.module.css';

export const metadata: Metadata = { title: 'Indicators' };

/**
 * Reference data, presented as reference data.
 *
 * No composite score, no signal light, no "current reading". Every series
 * states its source and its cadence, values are monospaced, and the only gold
 * on the page is the freshness dot.
 *
 * The previous observation is shown as a figure with its own date rather than
 * as a delta. A delta invites an arrow, an arrow invites a colour, and a
 * coloured arrow next to a price is an editorial position — which is the thing
 * the whole app is built not to take.
 */
export default async function IndicatorsPage() {
  const repositories = await requireClientRepositories();
  const ctx = readContext();

  const available = await repositories.indicators.available(ctx);
  const series = await repositories.indicators.series(
    ctx,
    available.map((one) => one.key),
  );

  return (
    <>
      <header className={page.header}>
        <h1 className={page.title}>Indicators</h1>
        <p className={page.lede}>
          Macro and on-chain series, as reference data. Each carries its source and its update
          cadence. Nothing here is a reading, a score or a view; the figures are the figures.
        </p>
      </header>

      {series.length === 0 ? (
        <EmptyDay
          headline="No series are currently available"
          detail={
            'No indicator is reporting observations to your account. This is a state on our '
            + 'side rather than a quiet market.'
          }
        />
      ) : (
        <div className={styles.grid}>
          {series.map((one) => (
            <SeriesCard key={one.key} series={one} />
          ))}
        </div>
      )}
    </>
  );
}

function SeriesCard({ series }: { series: IndicatorSeries }) {
  const latest = series.points.at(-1);
  const prior = series.points.at(-2);

  return (
    <article className={styles.series}>
      <h2 className={styles.label}>{series.label}</h2>

      {latest ? (
        <>
          <p className={styles.value}>
            {latest.value}
            {series.unit ? <span className={styles.unit}>{series.unit}</span> : null}
          </p>
          {prior ? (
            <p className={styles.prior}>
              Previous {prior.value} on {prior.at}
            </p>
          ) : (
            <p className={styles.prior}>No previous observation held</p>
          )}
        </>
      ) : (
        <p className={styles.prior}>No observation held</p>
      )}

      <div className={styles.meta}>
        <Freshness
          asAt={series.lastObservedAt}
          expectedCadenceDays={series.expectedCadenceDays}
        />
        <span>{series.sourceName}</span>
        <span>every {series.expectedCadenceDays}d</span>
      </div>
    </article>
  );
}
