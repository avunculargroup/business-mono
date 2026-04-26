import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { CategoryChip } from '@/components/news/CategoryChip';
import type { NewsCategory, NewsItemRecord } from '@platform/shared';
import { NEWS_CATEGORY_LABELS } from '@platform/shared';
import styles from './DailyDigest.module.css';

const ORDERED_CATEGORIES: NewsCategory[] = ['regulatory', 'corporate', 'macro', 'international'];

export default async function DailyDigestPage() {
  const supabase = await createClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const { data } = await supabase
    .from('news_items')
    .select('id, title, url, source_name, published_at, summary, category, relevance_score')
    .gte('fetched_at', today.toISOString())
    .lt('fetched_at', tomorrow.toISOString())
    .neq('status', 'archived')
    .order('relevance_score', { ascending: false, nullsFirst: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(100);

  const byCategory: Record<string, NewsItemRecord[]> = {};
  for (const item of data ?? []) {
    const cat = item.category as string;
    if (!byCategory[cat]) byCategory[cat] = [];
    if ((byCategory[cat]?.length ?? 0) < 5) {
      byCategory[cat]!.push(item as unknown as NewsItemRecord);
    }
  }

  const dateLabel = today.toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const activeCats = ORDERED_CATEGORIES.filter((c) => (byCategory[c]?.length ?? 0) > 0);

  return (
    <>
      <PageHeader title="Daily digest">
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          {dateLabel}
        </span>
        <Link href="/news" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-accent)' }}>
          Full feed
        </Link>
      </PageHeader>
      <div className={styles.container}>
        {activeCats.length === 0 ? (
          <div className={styles.empty}>
            <p>No articles have been ingested today yet. Routines run at 07:00 AEST.</p>
            <Link href="/routines" className={styles.link}>
              Check routines
            </Link>
          </div>
        ) : (
          activeCats.map((cat) => (
            <section key={cat} className={styles.section}>
              <div className={styles.sectionHeader}>
                <CategoryChip category={cat} />
                <h2 className={styles.sectionTitle}>{NEWS_CATEGORY_LABELS[cat]}</h2>
              </div>
              <div className={styles.items}>
                {(byCategory[cat] ?? []).map((item) => (
                  <article key={item.id} className={styles.item}>
                    <div className={styles.itemMeta}>
                      {item.source_name && (
                        <span className={styles.source}>{item.source_name}</span>
                      )}
                      {item.published_at && (
                        <span className={styles.date}>
                          {new Date(item.published_at).toLocaleDateString('en-AU', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      )}
                    </div>
                    <h3 className={styles.itemTitle}>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.itemLink}
                      >
                        {item.title}
                      </a>
                    </h3>
                    {item.summary && (
                      <p className={styles.itemSummary}>{item.summary}</p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </>
  );
}
