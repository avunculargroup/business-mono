import { getRepositories, demoReadContext } from '@/lib/repositories';
import Link from 'next/link';
import { Page } from '@/components/Page';
import styles from '@/components/Page.module.css';

export default async function NewsPage() {
  const { research } = getRepositories();
  const ctx = demoReadContext();
  const [{ items }, digest] = await Promise.all([
    research.listItems(ctx),
    research.listTodayDigest(ctx),
  ]);

  return (
    <Page
      title="Research"
      lede={`Sources are scored against a three-dimension rubric, then a human curator annotates what the score missed. ${digest.length} of these published today.`}
    >
      <div className={styles.grid}>
        {items.map((item, index) => (
          <article key={item.id} className={styles.card}>
            <div className={styles.cardTitle}>
              <Link href={`/news/${item.id}`}>{item.title}</Link>
            </div>
            <div className={styles.meta}>
              <span>{item.sourceName}</span>
              <span>{item.category}</span>
              {/* First row only — see the note on the dashboard's delta. */}
              <span
                className={styles.mono}
                data-annotation-id={index === 0 ? 'relevance-score' : undefined}
              >
                relevance {item.relevanceScore}
              </span>
            </div>
            {item.curatorNotes ? (
              <p className={styles.body}>Curator note: {item.curatorNotes}</p>
            ) : null}
          </article>
        ))}
      </div>
    </Page>
  );
}
