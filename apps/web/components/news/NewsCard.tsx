'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { useToast } from '@/providers/ToastProvider';
import { CategoryChip } from './CategoryChip';
import styles from './NewsCard.module.css';
import type { NewsCategory, NewsStatus } from '@platform/shared';

interface NewsCardProps {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  publishedAt: string | null;
  summary: string | null;
  category: NewsCategory;
  status: NewsStatus;
  onStatusChange?: (id: string, status: NewsStatus) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function NewsCard({
  id,
  title,
  url,
  sourceName,
  publishedAt,
  summary,
  category,
  status: initialStatus,
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
        source_url: url,
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

  const cardClass = [
    styles.card,
    status === 'reviewed' ? styles.reviewed : '',
    status === 'archived' ? styles.archived : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={cardClass}>
      <div className={styles.meta}>
        <CategoryChip category={category} />
        {sourceName && <span className={styles.source}>{sourceName}</span>}
        {publishedAt && (
          <>
            <span className={styles.dot}>·</span>
            <span className={styles.date}>{formatDate(publishedAt)}</span>
          </>
        )}
      </div>

      <h4 className={styles.title}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.titleLink}
        >
          {title}
          <ExternalLink size={12} strokeWidth={1.5} style={{ marginLeft: 4, verticalAlign: 'middle', opacity: 0.5 }} />
        </a>
      </h4>

      {summary && <p className={styles.summary}>{summary}</p>}

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
