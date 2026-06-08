'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { YouTubeFacade } from '@/components/podcasts/YouTubeFacade';
import { useToast } from '@/providers/ToastProvider';
import { formatDate, formatDateTime } from '@/lib/utils';
import {
  extractVideoId,
  formatTimestamp,
  TRANSCRIPT_STATUS_LABELS,
  TRANSCRIPT_STATUS_COLORS,
  TRANSCRIPT_SOURCE_LABELS,
} from '@/lib/podcasts';
import { requestEpisodeAction } from '@/app/actions/podcasts';
import type { PodcastEpisode, TranscriptSegment } from '@platform/shared';
import styles from './detail.module.css';

interface Props {
  episode: PodcastEpisode;
  segments: TranscriptSegment[];
  sourceName: string | null;
}

export function EpisodeDetail({ episode, segments, sourceName }: Props) {
  const router = useRouter();
  const { success, error } = useToast();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [videoStart, setVideoStart] = useState<number | null>(null);
  const [pending, setPending] = useState(false);

  const videoId = extractVideoId(episode.youtube_url);
  const hasTimestamps = episode.has_timestamps && segments.some((s) => s.start_seconds != null);

  const seekTo = (seconds: number | null) => {
    if (seconds == null) return;
    if (videoId) {
      setVideoStart(seconds);
    } else if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      void audioRef.current.play();
    }
  };

  const runAction = async (action: 'refetch' | 'deepgram' | 'retry', label: string) => {
    setPending(true);
    const result = await requestEpisodeAction(episode.id, action);
    setPending(false);
    if (result.error) return error(result.error);
    success(label);
    router.refresh();
  };

  return (
    <div className={styles.container}>
      <Link href="/news/podcasts" className={styles.back}>
        <ArrowLeft size={15} strokeWidth={1.5} />
        Podcast ingestion
      </Link>

      <div className={styles.header}>
        <div className={styles.headerMain}>
          <h1 className={styles.title}>{episode.title}</h1>
          <div className={styles.headerMeta}>
            {sourceName && <span className={styles.sourceChip}>{sourceName}</span>}
            {episode.published_at && <span className={styles.muted}>{formatDate(episode.published_at)}</span>}
            <StatusChip
              label={TRANSCRIPT_STATUS_LABELS[episode.transcript_status]}
              color={TRANSCRIPT_STATUS_COLORS[episode.transcript_status]}
            />
          </div>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" size="sm" loading={pending}
            onClick={() => runAction('refetch', 'Re-running the transcript waterfall')}>
            Fetch transcript
          </Button>
          {episode.transcript_source !== 'deepgram' && (
            <Button variant="secondary" size="sm" loading={pending}
              onClick={() => runAction('deepgram', 'Submitting to Deepgram')}>
              Transcribe with Deepgram
            </Button>
          )}
          {episode.transcript_status === 'failed' && (
            <Button variant="secondary" size="sm" loading={pending}
              onClick={() => runAction('retry', 'Retrying')}>
              Retry
            </Button>
          )}
        </div>
      </div>

      {/* ── Media ── */}
      {videoId ? (
        <YouTubeFacade videoId={videoId} title={episode.title} startSeconds={videoStart} />
      ) : episode.audio_url ? (
        <audio ref={audioRef} className={styles.audio} controls preload="none" src={episode.audio_url} />
      ) : null}

      <div className={styles.body}>
        {/* ── Transcript ── */}
        <div className={styles.transcriptCol}>
          <h2 className={styles.sectionTitle}>Transcript</h2>
          {episode.transcript_status !== 'available' ? (
            <p className={styles.stateNote}>
              {episode.transcript_status === 'failed'
                ? episode.transcript_error ?? 'Transcription failed.'
                : episode.transcript_status === 'skipped'
                  ? 'No free transcript was available and Deepgram was not enabled.'
                  : 'Transcript is still being resolved.'}
            </p>
          ) : segments.length > 0 ? (
            <div className={styles.transcript}>
              {segments.map((s) => (
                <div key={s.id} className={styles.segment}>
                  <div className={styles.segmentHead}>
                    {s.start_seconds != null && (
                      <button
                        type="button"
                        className={styles.timestamp}
                        onClick={() => seekTo(s.start_seconds)}
                        disabled={!videoId && !episode.audio_url}
                      >
                        {formatTimestamp(s.start_seconds)}
                      </button>
                    )}
                    {s.speaker && <span className={styles.speaker}>{s.speaker}</span>}
                  </div>
                  <p className={styles.segmentText}>{s.content}</p>
                </div>
              ))}
            </div>
          ) : episode.transcript_text ? (
            <div className={styles.plainTranscript}>
              {episode.transcript_text.split(/\n{2,}/).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          ) : (
            <p className={styles.stateNote}>Transcript text is not available.</p>
          )}
        </div>

        {/* ── Provenance ── */}
        <aside className={styles.provenance}>
          <h2 className={styles.sectionTitle}>Provenance</h2>
          <dl className={styles.provList}>
            <ProvRow label="Source" value={episode.transcript_source ? TRANSCRIPT_SOURCE_LABELS[episode.transcript_source] : '—'} />
            <ProvRow label="Format" value={episode.transcript_format ?? '—'} />
            <ProvRow label="Language" value={episode.transcript_lang ?? '—'} />
            <ProvRow label="Timestamps" value={hasTimestamps ? 'Yes' : 'No'} />
            <ProvRow label="Origin" value={episode.ingestion_origin} />
            <ProvRow
              label="Fetched"
              value={episode.transcript_fetched_at ? formatDateTime(episode.transcript_fetched_at) : '—'}
            />
            <ProvRow label="Embedded" value={episode.embedded_at ? formatDateTime(episode.embedded_at) : '—'} />
            {episode.duration_seconds != null && (
              <ProvRow label="Duration" value={formatTimestamp(episode.duration_seconds)} mono />
            )}
          </dl>
          {episode.curator_note && (
            <div className={styles.note}>
              <span className={styles.noteLabel}>Curator note</span>
              <p>{episode.curator_note}</p>
            </div>
          )}
          {episode.topic_tags.length > 0 && (
            <div className={styles.tags}>
              {episode.topic_tags.map((t) => (
                <span key={t} className={styles.tag}>{t}</span>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function ProvRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.provRow}>
      <dt className={styles.provLabel}>{label}</dt>
      <dd className={`${styles.provValue} ${mono ? styles.mono : ''}`}>{value}</dd>
    </div>
  );
}
