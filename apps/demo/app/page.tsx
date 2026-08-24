import Link from 'next/link';
import { getRepositories, demoReadContext } from '@/lib/repositories';
import { Page } from '@/components/Page';
import styles from '@/components/Page.module.css';

export default async function DashboardPage() {
  const { indicators } = getRepositories();
  const { macroLatest, onchainLatest } = await indicators.getDashboard(demoReadContext());

  return (
    <Page
      title="Dashboard"
      lede="Indicators the platform tracks daily. Deltas are shown as signed numbers with no direction, colour or sentiment attached — an Authorised Representative must not imply a recommendation, and green-up/red-down is that implication."
    >
      <div className={styles.grid}>
        {[...macroLatest, ...onchainLatest].map((indicator, index) => (
          <div key={indicator.shortLabel} className={styles.card}>
            <div className={styles.cardTitle}>{indicator.name}</div>
            <div className={styles.meta}>
              <span className={styles.mono}>
                {'currentValue' in indicator ? indicator.currentValue : indicator.value}
                {indicator.unit ? ` ${indicator.unit}` : ''}
              </span>
              {/* Only the first: the overlay resolves a target with
                  `querySelector`, so repeating the attribute down a list would
                  put the marker on row one by accident rather than by
                  decision. */}
              <span
                className={styles.mono}
                data-annotation-id={index === 0 ? 'indicator-delta' : undefined}
              >
                change since prior {indicator.changeSincePrior}
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className={styles.body}>
        <Link href="/market-reports">See how these become a daily report</Link>
      </p>
    </Page>
  );
}
