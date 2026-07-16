'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { useOptimisticList } from '@/hooks/useOptimisticList';
import { useToast } from '@/providers/ToastProvider';
import { TRANSCRIPT_STATUS_LABELS, TRANSCRIPT_STATUS_COLORS } from '@/lib/podcasts';
import { requestEpisodeAction } from '@/app/actions/podcasts';
import type { TranscriptStatus } from '@platform/shared';
import styles from '../podcasts.module.css';

export interface DecisionEpisode {
  id: string;
  slug: string;
  title: string;
  transcript_status: TranscriptStatus;
  transcript_error: string | null;
  source_name: string | null;
}

const NEEDS_ATTENTION: TranscriptStatus[] = ['failed', 'skipped'];

export function DecisionsList({ episodes: initial }: { episodes: DecisionEpisode[] }) {
  const { success, error } = useToast();
  const { items, optimisticUpdate } = useOptimisticList(initial);

  // Keep only episodes still needing a decision, so a resolved row leaves the
  // lane optimistically the moment its action fires.
  const triage = useMemo(
    () => items.filter((e) => NEEDS_ATTENTION.includes(e.transcript_status)),
    [items],
  );

  const runAction = (id: string, action: 'deepgram' | 'retry', label: string) => {
    optimisticUpdate(id, { transcript_status: 'resolving' }, async () => {
      const result = await requestEpisodeAction(id, action);
      if (result.error) error(result.error);
      else success(label);
    });
  };

  if (triage.length === 0) {
    return (
      <div className={styles.container}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Nothing needs a decision</h2>
          <p className={styles.panelHint}>
            Every episode has a transcript or is still resolving. Stalled episodes show up here.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Needs a decision</h2>
        <p className={styles.panelHint}>Episodes that stalled without a transcript. Resolve them here.</p>
        <div className={styles.triageList}>
          {triage.map((e) => (
            <div key={e.id} className={styles.triageRow}>
              <div className={styles.triageMain}>
                <Link href={`/news/podcasts/${e.slug}`} className={styles.triageTitle}>
                  {e.title}
                </Link>
                <div className={styles.triageSub}>
                  {e.source_name && <span className={styles.sourceChip}>{e.source_name}</span>}
                  <StatusChip
                    label={TRANSCRIPT_STATUS_LABELS[e.transcript_status]}
                    color={TRANSCRIPT_STATUS_COLORS[e.transcript_status]}
                  />
                  <span className={styles.triageReason}>
                    {e.transcript_status === 'failed'
                      ? e.transcript_error ?? 'Every transcript source errored.'
                      : 'No free transcript; Deepgram was off for this feed.'}
                  </span>
                </div>
              </div>
              {e.transcript_status === 'failed' ? (
                <Button variant="secondary" size="sm" onClick={() => runAction(e.id, 'retry', 'Retrying')}>
                  Retry
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => runAction(e.id, 'deepgram', 'Submitting to Deepgram')}
                >
                  Transcribe with Deepgram
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
