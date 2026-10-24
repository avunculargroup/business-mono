'use client';

import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { isSubscriberScoped } from '@platform/shared';
import { CategoryChip } from '@/components/news/CategoryChip';
import { cleanNewsTitle } from '@/lib/news/cleanTitle';
import { newsOriginalUrl } from '@/lib/news/itemHref';
import { formatDate } from '@/lib/utils';
import { ReportPanel } from './ReportPanel';
import styles from './detail.module.css';
import type { NewsItemDetail as NewsItem } from '@platform/data';

interface NewsItemDetailProps {
  item: NewsItem;
  /** The body, rendered by the server page with ArticleMarkdown; null when none was stored. */
  body: ReactNode;
}

export function NewsItemDetail({ item, body }: NewsItemDetailProps) {
  const link = newsOriginalUrl(item.url, item.canonicalUrl);
  // A tracking wrapper or tokened URL would register the click as BTS's paid
  // subscription. Ingest no longer stores them; rows from before it did may.
  const original = link && !isSubscriberScoped(link) ? link : null;

  return (
    <div className={styles.container}>
      <div className={styles.meta}>
        <CategoryChip category={item.category} />
        <span className={styles.sourceChip}>{item.sourceName}</span>
        {item.author && <span className={styles.muted}>{item.author}</span>}
        {item.publishedAt && (
          <span className={`${styles.muted} ${styles.mono}`}>{formatDate(item.publishedAt)}</span>
        )}
        {item.relevanceScore != null && (
          <span className={styles.score} title="Rex relevance score">
            {item.relevanceScore.toFixed(2)}
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

      {item.report && <ReportPanel report={item.report} />}

      {item.curatorNotes && (
        <div className={styles.curatorNote}>
          <span className={styles.curatorNoteLabel}>Why this matters</span>
          <span className={styles.curatorNoteBody}>{item.curatorNotes}</span>
        </div>
      )}

      {item.topicTags.length > 0 && (
        <div className={styles.tags}>
          {item.topicTags.map((tag) => (
            <span key={tag} className={styles.tag}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {body ? (
        <div className={styles.body}>{body}</div>
      ) : (
        <p className={styles.muted}>
          {item.report
            ? 'No readable text was extracted from this report. Download the original above.'
            : 'No full text was stored for this item. Use the original link above to read it.'}
        </p>
      )}
    </div>
  );
}
