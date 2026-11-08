'use client';

import { useTransition } from 'react';
import { CopyButton } from '@platform/ui/CopyButton';
import { Button } from '@platform/ui/Button';
import { useToast } from '@platform/ui/ToastProvider';
import { getImageDownloadUrl } from '@/app/actions/contentImages';
import styles from './SocialDraftCopyView.module.css';

export interface SocialDraftCopyViewProps {
  platform: 'linkedin' | 'twitter_x';
  accountName: string | null;
  body: string | null;
  isThread: boolean;
  segments: string[];
  disclaimerText: string | null;
  /** The marked platform crop, with a short-lived preview URL. */
  image?: { storagePath: string; altText: string | null; previewUrl: string | null } | null;
}

export function SocialDraftCopyView({
  platform,
  accountName,
  body,
  isThread,
  segments,
  disclaimerText,
  image = null,
}: SocialDraftCopyViewProps) {
  const [isDownloading, startDownload] = useTransition();
  const { error } = useToast();

  const handleDownload = () => {
    if (!image) return;
    startDownload(async () => {
      const result = await getImageDownloadUrl(image.storagePath);
      if ('error' in result) {
        error(result.error ?? 'The image could not be downloaded.');
        return;
      }
      window.location.assign(result.url);
    });
  };

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

      {image && (
        <div className={styles.image}>
          {image.previewUrl && (
            // Signed, short-lived storage URL: next/image would cache it past expiry.
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.imagePreview} src={image.previewUrl} alt={image.altText ?? ''} />
          )}
          {image.altText && (
            <div className={styles.altText}>
              <span className={styles.disclaimerTag}>Alt text</span>
              <p className={styles.disclaimerText}>{image.altText}</p>
              <CopyButton text={image.altText} label="Copy alt text" />
            </div>
          )}
          <Button variant="secondary" onClick={handleDownload} loading={isDownloading}>
            Download image
          </Button>
        </div>
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
