'use client';

import { useState, useMemo } from 'react';
import { Newspaper } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { NEWS_CATEGORY_LABELS } from '@platform/shared';
import type { NewsCategory, NewsStatus, NewsItemRecord } from '@platform/shared';
import { CategoryChip } from './CategoryChip';
import { NewsCard } from './NewsCard';
import styles from './NewsFeed.module.css';

const CATEGORIES: Array<NewsCategory | 'all'> = [
  'all', 'regulatory', 'corporate', 'macro', 'international',
];

const PAGE_SIZE = 7;

interface DigestItem {
  id: string;
  title: string;
  url: string;
  category: NewsCategory;
}

interface NewsFeedProps {
  initialItems: NewsItemRecord[];
  todayDigest: DigestItem[];
}

export function NewsFeed({ initialItems, todayDigest }: NewsFeedProps) {
  const [items, setItems] = useState<NewsItemRecord[]>(initialItems);
  const [activeCategory, setActiveCategory] = useState<NewsCategory | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(0);

  const handleStatusChange = (id: string, status: NewsStatus) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
  };

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (!showArchived && item.status === 'archived') return false;
      if (activeCategory !== 'all' && item.category !== activeCategory) return false;
      return true;
    });
  }, [items, activeCategory, showArchived]);

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleCategoryChange = (cat: NewsCategory | 'all') => {
    setActiveCategory(cat);
    setPage(0);
  };

  // Sidebar: group today's digest by category
  const digestByCat = useMemo(() => {
    const grouped: Partial<Record<NewsCategory, DigestItem[]>> = {};
    for (const item of todayDigest) {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category]!.push(item);
    }
    return grouped;
  }, [todayDigest]);

  const digestCategories = (Object.keys(digestByCat) as NewsCategory[]).filter(
    (c) => (digestByCat[c]?.length ?? 0) > 0,
  );

  return (
    <div className={styles.layout}>
      {/* Main feed */}
      <main>
        <div className={styles.filterBar}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`${styles.filterBtn} ${activeCategory === cat ? styles.active : ''}`}
              onClick={() => handleCategoryChange(cat)}
            >
              {cat === 'all' ? 'All' : NEWS_CATEGORY_LABELS[cat]}
            </button>
          ))}
          <span className={styles.filterSep} />
          <button
            type="button"
            className={`${styles.filterBtn} ${showArchived ? styles.active : ''}`}
            onClick={() => { setShowArchived((v) => !v); setPage(0); }}
          >
            Show archived
          </button>
        </div>

        {paged.length === 0 ? (
          <div className={styles.emptyContainer}>
            <EmptyState
              icon={Newspaper}
              title="No news yet"
              description="Routines will populate this feed daily at 07:00 AEST. Check the Routines page to confirm they are active."
            />
          </div>
        ) : (
          <div className={styles.feed}>
            {paged.map((item) => (
              <NewsCard
                key={item.id}
                id={item.id}
                title={item.title}
                url={item.url}
                sourceName={item.source_name}
                publishedAt={item.published_at}
                summary={item.summary}
                category={item.category}
                status={item.status}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        )}

        {pageCount > 1 && (
          <div className={styles.pagination}>
            <span>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of{' '}
              {filtered.length}
            </span>
            <div className={styles.paginationBtns}>
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 0}
              >
                Previous
              </button>
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= pageCount - 1}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Sidebar: today's digest */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarCard}>
          <p className={styles.sidebarHeading}>Today's digest</p>
          {digestCategories.length === 0 ? (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
              No articles ingested today yet.
            </p>
          ) : (
            digestCategories.map((cat) => (
              <div key={cat} className={styles.digestSection}>
                <div className={styles.digestSectionLabel}>
                  <CategoryChip category={cat} />
                </div>
                {(digestByCat[cat] ?? []).slice(0, 3).map((item) => (
                  <div key={item.id} className={styles.digestItem}>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.digestLink}
                    >
                      {item.title}
                    </a>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
