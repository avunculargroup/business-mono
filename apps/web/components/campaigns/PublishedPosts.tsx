'use client';

import { useState, useTransition } from 'react';
import { ExternalLink, BarChart3, Bookmark, Check } from 'lucide-react';
import { useToast } from '@/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { savePostMetrics, promotePostToSnippet } from '@/app/actions/campaigns';
import styles from './PublishedPosts.module.css';

// Published variants: their live link, inline platform-aware metrics entry
// (published posts visibly carry their numbers), and "Save to voice snippets" —
// promoting a strong post into the exemplar library (source = promoted_from_post,
// founder writes the curator note). Step 9's learning loop.

export interface Metrics {
  impressions: number | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
  clicks: number | null;
}

export interface PublishedItem {
  id: string;
  title: string | null;
  body: string | null;
  type: 'linkedin' | 'twitter_x';
  is_thread: boolean;
  published_url: string | null;
  account_name: string | null;
  metrics: Metrics | null;
}

// Platform-aware labels over the fixed post_metrics columns.
const FIELD_LABELS: Record<'twitter_x' | 'linkedin', Record<keyof Metrics, string>> = {
  twitter_x: { impressions: 'Impressions', reactions: 'Likes', comments: 'Replies', reposts: 'Reposts', clicks: 'Clicks' },
  linkedin: { impressions: 'Impressions', reactions: 'Reactions', comments: 'Comments', reposts: 'Reposts', clicks: 'Clicks' },
};

const FIELDS: Array<keyof Metrics> = ['impressions', 'reactions', 'comments', 'reposts', 'clicks'];

function MetricsRow({ item, campaignId }: { item: PublishedItem; campaignId: string }) {
  const { success, error } = useToast();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<keyof Metrics, string>>(() => {
    const m = item.metrics;
    return {
      impressions: m?.impressions?.toString() ?? '',
      reactions: m?.reactions?.toString() ?? '',
      comments: m?.comments?.toString() ?? '',
      reposts: m?.reposts?.toString() ?? '',
      clicks: m?.clicks?.toString() ?? '',
    };
  });

  const labels = FIELD_LABELS[item.type];

  const save = () => {
    startTransition(async () => {
      const toNum = (v: string) => (v.trim() === '' ? null : Number(v));
      const result = await savePostMetrics(item.id, campaignId, item.type, {
        impressions: toNum(values.impressions),
        reactions: toNum(values.reactions),
        comments: toNum(values.comments),
        reposts: toNum(values.reposts),
        clicks: toNum(values.clicks),
      });
      if (result.error) {
        error(result.error);
        return;
      }
      success('Metrics saved.');
    });
  };

  return (
    <div className={styles.metrics}>
      <span className={styles.kicker}>
        <BarChart3 size={14} strokeWidth={1.5} /> Performance
      </span>
      <div className={styles.metricFields}>
        {FIELDS.map((f) => (
          <label key={f} className={styles.metricField}>
            <span className={styles.metricLabel}>{labels[f]}</span>
            <input
              className={styles.metricInput}
              type="number"
              min={0}
              inputMode="numeric"
              value={values[f]}
              onChange={(e) => setValues((prev) => ({ ...prev, [f]: e.target.value }))}
            />
          </label>
        ))}
        <Button variant="secondary" size="sm" loading={isPending} onClick={save}>
          Save metrics
        </Button>
      </div>
    </div>
  );
}

function PromotePanel({ item, campaignId }: { item: PublishedItem; campaignId: string }) {
  const { success, error } = useToast();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [note, setNote] = useState('');

  const promote = () => {
    startTransition(async () => {
      const result = await promotePostToSnippet(item.id, campaignId, {
        body: item.body ?? '',
        curator_note: note.trim(),
        snippet_type: 'full_post',
      });
      if (result.error) {
        error(result.error);
        return;
      }
      success('Saved to voice snippets.');
      setDone(true);
      setOpen(false);
    });
  };

  if (done) {
    return (
      <div className={styles.promoted} role="status">
        <Check size={16} strokeWidth={1.5} />
        Saved to the voice exemplar library.
      </div>
    );
  }

  return (
    <div className={styles.promote}>
      <button type="button" className={styles.promoteToggle} onClick={() => setOpen((v) => !v)}>
        <Bookmark size={16} strokeWidth={1.5} />
        Save to voice snippets
      </button>
      {open && (
        <div className={styles.promoteForm}>
          <textarea
            className={styles.textarea}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Why does this post demonstrate the voice? (curator note, required)"
          />
          <Button
            variant="primary"
            size="sm"
            loading={isPending}
            disabled={note.trim().length === 0}
            onClick={promote}
          >
            Save snippet
          </Button>
        </div>
      )}
    </div>
  );
}

export function PublishedPosts({ items, campaignId }: { items: PublishedItem[]; campaignId: string }) {
  if (items.length === 0) return null;
  return (
    <section className={styles.wrap} aria-label="Published posts">
      <h2 className={styles.title}>Published</h2>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id} className={styles.card}>
            <header className={styles.cardHead}>
              <div className={styles.meta}>
                <span className={styles.account}>{item.account_name}</span>
                <span className={styles.platform}>{item.type === 'twitter_x' ? 'X' : 'LinkedIn'}</span>
              </div>
              {item.published_url && (
                <a className={styles.liveLink} href={item.published_url} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} strokeWidth={1.5} />
                  View live
                </a>
              )}
            </header>
            {item.body && <p className={styles.body}>{item.body}</p>}
            <MetricsRow item={item} campaignId={campaignId} />
            <PromotePanel item={item} campaignId={campaignId} />
          </li>
        ))}
      </ul>
    </section>
  );
}
