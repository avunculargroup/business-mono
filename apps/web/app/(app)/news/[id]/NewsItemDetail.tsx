'use client';

import { ExternalLink } from 'lucide-react';
import { CategoryChip } from '@/components/news/CategoryChip';
import { MarkdownRecordDisplay } from '@/components/company/MarkdownRecordDisplay';
import { cleanNewsTitle } from '@/lib/news/cleanTitle';
import { newsOriginalUrl } from '@/lib/news/itemHref';
import { formatDate } from '@/lib/utils';
import styles from './detail.module.css';
import type { NewsItemRecord } from '@platform/shared';

interface NewsItemDetailProps {
  item: NewsItemRecord;
  sourceName: string;
}

export function NewsItemDetail({ item, sourceName }: NewsItemDetailProps) {
  const original = newsOriginalUrl(item.url, item.canonical_url);

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
