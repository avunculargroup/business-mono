import { getRepositories, demoReadContext } from '@/lib/repositories';
import { Page } from '@/components/Page';
import styles from '@/components/Page.module.css';

export default async function SignalsPage() {
  const { ecosystem } = getRepositories();
  const ctx = demoReadContext();
  const [changes, watches] = await Promise.all([
    ecosystem.listFeed(ctx),
    ecosystem.listWatchHealth(ctx),
  ]);

  return (
    <Page
      title="Signals"
      lede="Changes across the products and partners the business depends on. Each one is classified for compliance the moment it is detected, not when someone tries to send it — so promoting a change to a client is a gate that is already answered."
    >
      <div className={styles.grid}>
        {changes.map((change) => (
          <article key={change.id} className={styles.card}>
            <div className={styles.cardTitle}>{change.title}</div>
            <div className={styles.meta}>
              <span>{change.entityName}</span>
              <span>{change.changeType}</span>
              <span>compliance: {change.complianceClass ?? 'unclassified'}</span>
            </div>
            {change.curatorNote ? (
              <p className={styles.body}>Curator note: {change.curatorNote}</p>
            ) : null}
          </article>
        ))}
      </div>

      <h2 className={styles.cardTitle} style={{ marginTop: 'var(--space-8)' }}>
        Watch health
      </h2>
      <div className={styles.grid}>
        {watches.map((watch) => (
          <article key={watch.id} className={styles.card}>
            <div className={styles.cardTitle}>{watch.label}</div>
            <div className={styles.meta}>
              <span>{watch.health}</span>
              <span>{watch.watchType}</span>
              <span className={styles.mono}>{watch.daysSinceCheck}d since check</span>
            </div>
          </article>
        ))}
      </div>
    </Page>
  );
}
