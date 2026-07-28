'use client';

import { ExternalLink } from 'lucide-react';
import { CategoryChip } from '@/components/news/CategoryChip';
import { MarkdownRecordDisplay } from '@/components/company/MarkdownRecordDisplay';
import { cleanNewsTitle } from '@/lib/news/cleanTitle';
import { formatDate } from '@/lib/utils';
import styles from './detail.module.css';
import type { NewsItemRecord } from '@platform/shared';

interface NewsItemDetailProps {
  item: NewsItemRecord;
  sourceName: string;
}

/**
 * The original article, when there is one. canonical_url is the publisher's
 * hosted copy of a newsletter issue; url is the article itself for feed and
 * followed-link items. Email items with neither have nothing to link to.
 */
function originalUrl(item: NewsItemRecord): string | null {
  if (/^https?:\/\//i.test(item.url)) return item.url;
  if (item.canonical_url && /^https?:\/\//i.test(item.canonical_url)) return item.canonical_url;
  return null;
}

export function NewsItemDetail({ item, sourceName }: NewsItemDetailProps) {
  const original = originalUrl(item);

  return (
    <div className={styles.container}>
      <div className={styles.meta}>
        <CategoryChip category={item.category} />
        <span className={styles.sourceChip}>{sourceName}</span>
        {item.author && <span className={styles.muted}>{item.author}</span>}
        {item.published_at && (
          <span className={`${styles.muted} ${styles.mono}`}>{formatDate(item.published_at)}</span>
        )}
        {item.relevance_score != null && (
          <span className={styles.score} title="Rex relevance score">
            {item.relevance_score.toFixed(2)}
          </span>
        )}
      </div>

      <h1 className={styles.title}>{cleanNewsTitle(item.title)}</h1>

      {original && (
        <a href={original} target="_blank" rel="noopener noreferrer" className={styles.originalLink}>
          View original
          <ExternalLink size={14} strokeWidth={1.5} />
        </a>
      )}

      {item.summary && <p className={styles.summary}>{item.summary}</p>}

      {item.curator_notes && (
        <div className={styles.curatorNote}>
          <span className={styles.curatorNoteLabel}>Why this matters</span>
          <span className={styles.curatorNoteBody}>{item.curator_notes}</span>
        </div>
      )}

      {item.topic_tags.length > 0 && (
        <div className={styles.tags}>
          {item.topic_tags.map((tag) => (
            <span key={tag} className={styles.tag}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {item.body_markdown ? (
        <div className={styles.body}>
          <MarkdownRecordDisplay content={item.body_markdown} />
        </div>
      ) : (
        <p className={styles.muted}>
          No full text was stored for this item. Use the original link above to read it.
        </p>
      )}
    </div>
  );
}
