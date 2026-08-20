import { getRepositories, demoReadContext } from '@/lib/repositories';
import { Page } from '@/components/Page';
import styles from '@/components/Page.module.css';

export default async function ActivityPage() {
  const { agentActivity } = getRepositories();
  const ctx = demoReadContext();
  const [{ items }, pending] = await Promise.all([
    agentActivity.listActivity(ctx),
    agentActivity.countPending(ctx),
  ]);

  return (
    <Page
      title="Agent activity"
      lede={`Every agent logs here, and specialists never message a human directly — work reaches a director through Simon or through an approval. ${pending} item${pending === 1 ? '' : 's'} awaiting a decision.`}
    >
      <div className={styles.grid}>
        {items.map((item) => (
          <article key={item.id} className={styles.card}>
            <div className={styles.cardTitle}>{item.action}</div>
            <div className={styles.meta}>
              <span>{item.agentName}</span>
              <span>{item.status}</span>
              <span>{item.triggerType}</span>
            </div>
            {item.proposedActions.length > 0 ? (
              <ul className={styles.body}>
                {item.proposedActions.map((action) => (
                  <li key={action.label}>{action.label}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </Page>
  );
}
