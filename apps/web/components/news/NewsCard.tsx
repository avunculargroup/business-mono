'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { useToast } from '@/providers/ToastProvider';
import { CategoryChip } from './CategoryChip';
import { cleanNewsTitle } from '@/lib/news/cleanTitle';
import { newsItemHref, newsOriginalUrl } from '@/lib/news/itemHref';
import { formatDate } from '@/lib/utils';
import styles from './NewsCard.module.css';
import type { NewsCategory, NewsStatus } from '@platform/shared';

interface NewsCardProps {
  id: string;
  title: string;
  url: string;
  /** Publisher's hosted copy, for email items whose url is synthetic. */
  canonicalUrl?: string | null;
  /** og:image scraped from the source page. Null for email-sourced items. */
  imageUrl?: string | null;
  sourceName: string;
  publishedAt: string | null;
  summary: string | null;
  category: NewsCategory;
  status: NewsStatus;
  relevanceScore?: number | null;
  curatorNotes?: string | null;
  onStatusChange?: (id: string, status: NewsStatus) => void;
}

export function NewsCard({
  id,
  title,
  url,
  canonicalUrl,
  imageUrl,
  sourceName,
  publishedAt,
  summary,
  category,
  status: initialStatus,
  relevanceScore,
  curatorNotes,
  onStatusChange,
}: NewsCardProps) {
  const [status, setStatus] = useState<NewsStatus>(initialStatus);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const supabase = createClient();

  const updateStatus = async (next: NewsStatus) => {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase
      .from('news_items')
      .update({ status: next })
      .eq('id', id);
    setBusy(false);
    if (error) {
      toast.error('Could not update article status.');
      return;
    }
    setStatus(next);
    onStatusChange?.(id, next);
  };

  const promote = async () => {
    if (busy) return;
    setBusy(true);
    const { data: ki, error: kiErr } = await supabase
      .from('knowledge_items')
      .insert({
        title,
        // Never the synthetic email:// url — an email item's real address is
        // its canonical_url, and null is better than a link that opens nothing.
        source_url: newsOriginalUrl(url, canonicalUrl),
        source_type: 'article',
        summary: summary ?? undefined,
        archived_by: 'rex',
        topic_tags: [category],
      })
      .select('id')
      .single();

    if (kiErr || !ki) {
      setBusy(false);
      toast.error('Could not promote to knowledge base.');
      return;
    }

    await supabase
      .from('news_items')
      .update({ status: 'promoted', knowledge_item_id: ki.id })
      .eq('id', id);

    setBusy(false);
    setStatus('promoted');
    onStatusChange?.(id, 'promoted');
    toast.success('Article promoted to the knowledge base.');
  };

  const titleLink = newsItemHref(id, url);

  const cardClass = [
    styles.card,
    status === 'reviewed' ? styles.reviewed : '',
    status === 'archived' ? styles.archived : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={cardClass}>
      <div className={styles.top}>
        <div className={styles.content}>
          <div className={styles.meta}>
            <CategoryChip category={category} />
            {sourceName && <span className={styles.source}>{sourceName}</span>}
            {publishedAt && (
              <>
                <span className={styles.dot}>·</span>
                <span className={styles.date}>{publishedAt ? formatDate(publishedAt) : ''}</span>
              </>
            )}
            {relevanceScore != null && (
              <span className={styles.score} title="Rex relevance score">
                {relevanceScore.toFixed(2)}
              </span>
            )}
          </div>

          <h4 className={styles.title}>
            {titleLink.external ? (
              <a
                href={titleLink.href}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.titleLink}
              >
                {cleanNewsTitle(title)}
                <ExternalLink size={12} strokeWidth={1.5} style={{ marginLeft: 4, verticalAlign: 'middle', opacity: 0.5 }} />
              </a>
            ) : (
              <Link href={titleLink.href} className={styles.titleLink}>
                {cleanNewsTitle(title)}
              </Link>
            )}
          </h4>

          {summary && <p className={styles.summary}>{summary}</p>}
        </div>

        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- remote, unknown host; avoids next/image remotePatterns config
          <img src={imageUrl} alt="" className={styles.thumb} loading="lazy" />
        )}
      </div>

      {curatorNotes && (
        <div className={styles.curatorNote}>
          <span className={styles.curatorNoteLabel}>Why this matters</span>
          <span className={styles.curatorNoteBody}>{curatorNotes}</span>
        </div>
      )}

      <div className={styles.actions}>
        {status === 'new' && (
          <>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => updateStatus('reviewed')}
              disabled={busy}
            >
              Mark reviewed
            </button>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.promote}`}
              onClick={promote}
              disabled={busy}
            >
              Add to knowledge base
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => updateStatus('archived')}
              disabled={busy}
            >
              Archive
            </button>
          </>
        )}
        {status === 'reviewed' && (
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.promote}`}
            onClick={promote}
            disabled={busy}
          >
            Add to knowledge base
          </button>
        )}
        {(status === 'reviewed' || status === 'archived') && (
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => updateStatus('new')}
            disabled={busy}
          >
            Mark new
          </button>
        )}

        {status !== 'new' && (
          <span className={`${styles.statusBadge} ${styles[status]}`}>
            {status}
          </span>
        )}
      </div>
    </article>
  );
}
