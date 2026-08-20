import { getRepositories, demoReadContext } from '@/lib/repositories';
import { Page } from '@/components/Page';
import styles from '@/components/Page.module.css';

export default async function ContentPage() {
  const { content } = getRepositories();
  const { items } = await content.listCards(demoReadContext());

  return (
    <Page
      title="Content"
      lede="Drafts move idea → draft → review → approved → published, and nothing reaches a public channel without a human approving it and a compliance verdict clearing it. That gate never graduates to autonomous."
    >
      <div className={styles.grid}>
        {items.map((card) => (
          <article key={card.id} className={styles.card}>
            <div className={styles.cardTitle}>{card.title}</div>
            <div className={styles.meta}>
              <span>{card.status}</span>
              <span>{card.type}</span>
              {card.accountName ? <span>{card.accountName}</span> : null}
            </div>
          </article>
        ))}
      </div>
    </Page>
  );
}
