import { notFound } from 'next/navigation';
import { NotFoundError } from '@platform/data';
import { getRepositories, demoReadContext } from '@/lib/repositories';
import { Page } from '@/components/Page';
import styles from '@/components/Page.module.css';

export default async function NewsItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { research } = getRepositories();

  // The repository rejects rather than returning null, so a missing article is
  // a caught error rather than a null check — the same shape the live adapter
  // has, and the reason `NotFoundError` exists rather than a nullable return.
  const item = await research.getItem(demoReadContext(), id).catch((err: unknown) => {
    if (err instanceof NotFoundError) return null;
    throw err;
  });

  if (!item) notFound();

  return (
    <Page title={item.title} lede={item.summary ?? undefined}>
      <div className={styles.card}>
        <div className={styles.meta}>
          <span>{item.sourceName}</span>
          <span>{item.category}</span>
          <span className={styles.mono}>relevance {item.relevanceScore}</span>
          {item.url.startsWith('email://') ? <span>arrived by email</span> : null}
        </div>
      </div>

      {item.curatorNotes ? (
        <section className={styles.card} data-annotation-id="curator-note">
          <h2 className={styles.cardTitle}>Curator note</h2>
          <p className={styles.prose}>{item.curatorNotes}</p>
        </section>
      ) : (
        <p className={styles.empty}>No curator note on this item.</p>
      )}

      {item.bodyMarkdown ? (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Extract</h2>
          <p className={styles.prose}>{item.bodyMarkdown}</p>
        </section>
      ) : null}
    </Page>
  );
}
