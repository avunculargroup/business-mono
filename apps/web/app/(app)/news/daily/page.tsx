import Link from 'next/link';
import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { CategoryChip } from '@/components/news/CategoryChip';
import { cleanNewsTitle } from '@/lib/news/cleanTitle';
import { newsItemHref } from '@/lib/news/itemHref';
import type { NewsCategory } from '@platform/shared';
import type { NewsDigestItem } from '@platform/data';
import { NEWS_CATEGORY_LABELS, DEFAULT_TIMEZONE, dayBoundsInTz } from '@platform/shared';
import styles from './DailyDigest.module.css';

const ORDERED_CATEGORIES: NewsCategory[] = ['regulatory', 'corporate', 'macro', 'international'];

export default async function DailyDigestPage() {
  const repositories = await getRepositories();
  const ctx = resolveReadContext();

  const items = await repositories.research.listTodayDigest(ctx);

  // The day this page is showing. The repository bounds the query from the same
  // anchor, so the heading and the rows can never disagree about which day it is.
  const { start } = dayBoundsInTz(DEFAULT_TIMEZONE, ctx.asOf);

  // Top five per category. Left here rather than pushed into the adapter: it is
  // presentation over an already-bounded set, and doing it in SQL needs a window
  // function for no benefit at this size.
  const byCategory: Record<string, NewsDigestItem[]> = {};
  for (const item of items) {
    const cat = item.category as string;
    if (!byCategory[cat]) byCategory[cat] = [];
    if ((byCategory[cat]?.length ?? 0) < 5) {
      byCategory[cat]!.push(item);
    }
  }

  const dateLabel = start.toLocaleDateString('en-AU', {
    timeZone: DEFAULT_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const activeCats = ORDERED_CATEGORIES.filter((c) => (byCategory[c]?.length ?? 0) > 0);

  return (
    <>
      <PageHeader title="Daily digest">
        <span className={styles.headerMeta}>{dateLabel}</span>
        <Link href="/news" className={styles.headerLink}>Full feed</Link>
      </PageHeader>
      <div className={styles.container}>
        {activeCats.length === 0 ? (
          <div className={styles.empty}>
            <p>No articles have been ingested for today yet.</p>
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
                {(byCategory[cat] ?? []).map((item) => {
                  const link = newsItemHref(item.id, item.url);
                  return (
                  <article key={item.id} className={styles.item}>
                    <div className={styles.itemMeta}>
                      {item.sourceName && (
                        <span className={styles.source}>{item.sourceName}</span>
                      )}
                      {item.publishedAt && (
                        <span className={styles.date}>
                          {new Date(item.publishedAt).toLocaleDateString('en-AU', {
                            timeZone: DEFAULT_TIMEZONE,
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      )}
                    </div>
                    <h3 className={styles.itemTitle}>
                      {link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.itemLink}
                        >
                          {cleanNewsTitle(item.title)}
                        </a>
                      ) : (
                        <Link href={link.href} className={styles.itemLink}>
                          {cleanNewsTitle(item.title)}
                        </Link>
                      )}
                    </h3>
                    {item.summary && (
                      <p className={styles.itemSummary}>{item.summary}</p>
                    )}
                  </article>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </>
  );
}
