'use client';

import { CopyButton } from '@/components/ui/CopyButton';
import styles from './SocialDraftCopyView.module.css';

export interface SocialDraftCopyViewProps {
  platform: 'linkedin' | 'twitter_x';
  accountName: string | null;
  body: string | null;
  isThread: boolean;
  segments: string[];
  disclaimerText: string | null;
}

export function SocialDraftCopyView({
  platform,
  accountName,
  body,
  isThread,
  segments,
  disclaimerText,
}: SocialDraftCopyViewProps) {
  const fullText = isThread ? segments.map((s, i) => `${i + 1}/ ${s}`).join('\n\n') : (body ?? '');

  return (
    <div className={styles.card}>
      <header className={styles.head}>
        {accountName && <span className={styles.account}>{accountName}</span>}
        <span className={styles.platform}>
          {platform === 'twitter_x' ? 'X' : 'LinkedIn'}
          {isThread ? ' · thread' : ''}
        </span>
      </header>

      {isThread ? (
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
        <p className={styles.body}>{body}</p>
      )}

      {disclaimerText && (
        <div className={styles.disclaimer}>
          <span className={styles.disclaimerTag}>Disclaimer</span>
          <p className={styles.disclaimerText}>{disclaimerText}</p>
        </div>
      )}

      <div className={styles.actions}>
        <CopyButton text={fullText} label={isThread ? 'Copy all segments' : 'Copy text'} />
      </div>
    </div>
  );
}
