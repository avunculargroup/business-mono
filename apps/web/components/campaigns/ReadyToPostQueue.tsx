'use client';

import { useState, useTransition } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import { useToast } from '@/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { markVariantPosted } from '@/app/actions/campaigns';
import styles from './ReadyToPostQueue.module.css';

// The ready-to-post queue: each approved variant with everything a founder needs
// to copy out and post by hand. Copy text (segment-by-segment for threads — X's
// composer takes them one at a time), the attached disclaimer, then mark-as-posted
// with the live URL (writes published_url + advances status to published).

export interface QueueItem {
  id: string;
  title: string | null;
  body: string | null;
  type: 'linkedin' | 'twitter_x';
  is_thread: boolean;
  scheduled_for: string | null;
  account_name: string | null;
  platform: 'linkedin' | 'twitter_x';
  profile_url: string | null;
  disclaimer_text: string | null;
}

function formatWhen(scheduledFor: string | null): string {
  if (!scheduledFor) return 'Unscheduled';
  const [date, time] = scheduledFor.split('T');
  return time ? `${date} · ${time.slice(0, 5)}` : (date ?? scheduledFor);
}

function QueueCard({
  item,
  campaignId,
  segments,
}: {
  item: QueueItem;
  campaignId: string;
  segments: string[];
}) {
  const { error, success } = useToast();
  const [isPending, startTransition] = useTransition();
  const [url, setUrl] = useState('');
  const [posted, setPosted] = useState(false);

  const fullText = item.is_thread
    ? segments.map((s, i) => `${i + 1}/ ${s}`).join('\n\n')
    : (item.body ?? '');

  const markPosted = () => {
    startTransition(async () => {
      const result = await markVariantPosted(item.id, campaignId, { url: url.trim() });
      if (result.error) {
        error(result.error);
        return;
      }
      success('Marked as posted.');
      setPosted(true);
    });
  };

  return (
    <li className={`${styles.card} ${posted ? styles.cardDone : ''}`}>
      <header className={styles.cardHead}>
        <div className={styles.meta}>
          <span className={styles.account}>{item.account_name}</span>
          <span className={styles.platform}>
            {item.platform === 'twitter_x' ? 'X' : 'LinkedIn'}
            {item.is_thread ? ' · thread' : ''}
          </span>
        </div>
        <span className={styles.when}>{formatWhen(item.scheduled_for)}</span>
      </header>

      {item.is_thread ? (
        <ol className={styles.segments}>
          {segments.map((seg, i) => (
            <li key={i} className={styles.segment}>
              <div className={styles.segmentHead}>
                <span className={styles.segmentNo}>{i + 1}/</span>
                <CopyButton text={seg} label="Copy segment" />
              </div>
              <p className={styles.segmentBody}>{seg}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.body}>{item.body}</p>
      )}

      {item.disclaimer_text && (
        <div className={styles.disclaimer}>
          <span className={styles.disclaimerTag}>Disclaimer</span>
          <p className={styles.disclaimerText}>{item.disclaimer_text}</p>
        </div>
      )}

      <div className={styles.cardActions}>
        <CopyButton text={fullText} label={item.is_thread ? 'Copy all segments' : 'Copy text'} />
        {item.profile_url && (
          <a className={styles.copyBtn} href={item.profile_url} target="_blank" rel="noreferrer">
            <ExternalLink size={14} strokeWidth={1.5} />
            Open account
          </a>
        )}
      </div>

      {posted ? (
        <div className={styles.postedNote} role="status">
          <Check size={16} strokeWidth={1.5} />
          Posted — moved to published.
        </div>
      ) : (
        <div className={styles.postRow}>
          <input
            className={styles.urlInput}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste the live post URL"
            inputMode="url"
          />
          <Button
            variant="primary"
            size="sm"
            loading={isPending}
            disabled={url.trim().length === 0}
            onClick={markPosted}
          >
            Mark as posted
          </Button>
        </div>
      )}
    </li>
  );
}

export function ReadyToPostQueue({
  campaignId,
  items,
  segmentsByItem,
}: {
  campaignId: string;
  items: QueueItem[];
  segmentsByItem: Record<string, string[]>;
}) {
  if (items.length === 0) {
    return (
      <div className={styles.empty} role="status">
        Nothing is ready to post yet. Variants land here once they&rsquo;re approved.
      </div>
    );
  }

  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <QueueCard
          key={item.id}
          item={item}
          campaignId={campaignId}
          segments={segmentsByItem[item.id] ?? []}
        />
      ))}
    </ul>
  );
}
