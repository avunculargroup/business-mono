'use client';

import { useState, useTransition } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import { useToast } from '@platform/ui/ToastProvider';
import { Button } from '@platform/ui/Button';
import { CopyButton } from '@platform/ui/CopyButton';
import { markVariantPosted } from '@/app/actions/campaigns';
import styles from './ReadyToPostQueue.module.css';
import type { ReadyToPostItem } from '@platform/data';

// The ready-to-post queue: each approved variant with everything a founder needs
// to copy out and post by hand. Copy text (segment-by-segment for threads — X's
// composer takes them one at a time), the attached disclaimer, then mark-as-posted
// with the live URL (writes published_url + advances status to published).

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
  item: ReadyToPostItem;
  campaignId: string;
  segments: string[];
}) {
  const { error, success } = useToast();
  const [isPending, startTransition] = useTransition();
  const [url, setUrl] = useState('');
  const [posted, setPosted] = useState(false);

  const fullText = item.isThread
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
          <span className={styles.account}>{item.accountName}</span>
          <span className={styles.platform}>
            {item.platform === 'twitter_x' ? 'X' : 'LinkedIn'}
            {item.isThread ? ' · thread' : ''}
          </span>
        </div>
        <span className={styles.when}>{formatWhen(item.scheduledFor)}</span>
      </header>

      {item.isThread ? (
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

      {item.disclaimerText && (
        <div className={styles.disclaimer}>
          <span className={styles.disclaimerTag}>Disclaimer</span>
          <p className={styles.disclaimerText}>{item.disclaimerText}</p>
        </div>
      )}

      <div className={styles.cardActions}>
        <CopyButton text={fullText} label={item.isThread ? 'Copy all segments' : 'Copy text'} />
        {item.profileUrl && (
          <a className={styles.copyBtn} href={item.profileUrl} target="_blank" rel="noreferrer">
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
}: {
  campaignId: string;
  items: ReadyToPostItem[];
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
          segments={item.segments}
        />
      ))}
    </ul>
  );
}
