'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Copy, Search } from 'lucide-react';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { BtsLogo } from '@/components/app-shell/BtsLogo';
import { YouTubeFacade } from '@/components/podcasts/YouTubeFacade';
import { AudioPlayer } from '@/components/podcasts/AudioPlayer';
import { useToast } from '@/providers/ToastProvider';
import { formatDate, formatDateTime } from '@/lib/utils';
import {
  extractVideoId,
  formatTimestamp,
  highlightText,
  htmlToText,
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
  // Deep-link arrival second (from transcript search ?t=): seek the media once.
  initialSeek?: number | null;
}

export function EpisodeDetail({ episode, segments, sourceName, initialSeek = null }: Props) {
  const router = useRouter();
  const { success, error } = useToast();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [videoStart, setVideoStart] = useState<number | null>(null);
  const [pending, setPending] = useState(false);

  // Long transcripts make the page unwieldy, so clamp them to a fixed height
  // and only surface the show-more control once the content actually overflows.
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [transcriptOverflows, setTranscriptOverflows] = useState(false);

  // In-transcript find: highlight matches, and step through them with prev/next.
  const [query, setQuery] = useState('');
  const [activeMatch, setActiveMatch] = useState(0);
  const searchActive = query.trim() !== '';

  const videoId = extractVideoId(episode.youtube_url);
  const description = htmlToText(episode.description);
  const hasTimestamps = episode.has_timestamps && segments.some((s) => s.start_seconds != null);

  const transcriptTexts = useMemo(
    () =>
      segments.length > 0
        ? segments.map((s) => s.content)
        : (episode.transcript_text ?? '').split(/\n{2,}/),
    [segments, episode.transcript_text],
  );
  const matchCount = useMemo(() => {
    if (!searchActive) return 0;
    return transcriptTexts.reduce(
      (n, t) => n + highlightText(t, query).filter((p) => p.match).length,
      0,
    );
  }, [transcriptTexts, query, searchActive]);

  // While searching, drop the clamp so matches below the fold are reachable.
  const transcriptClamped = !transcriptExpanded && !searchActive;

  // Move the "active" styling to the current match and scroll it into view.
  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    const marks = Array.from(el.querySelectorAll('mark'));
    marks.forEach((m, i) => m.classList.toggle(styles.markActive!, i === activeMatch));
    marks[activeMatch]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeMatch, query, matchCount]);

  const stepMatch = (delta: number) => {
    if (matchCount === 0) return;
    setActiveMatch((i) => (i + delta + matchCount) % matchCount);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      success('Copied with citation');
    } catch {
      error('Could not copy to the clipboard');
    }
  };

  const copySegment = (content: string, speaker: string | null, startSeconds: number | null) => {
    const stamp = startSeconds != null ? ` @ ${formatTimestamp(startSeconds)}` : '';
    const who = speaker ? `${speaker}, ` : '';
    copyToClipboard(`"${content}" — ${who}${episode.title}${stamp}`);
  };

  const copyTranscript = () => {
    const body =
      segments.length > 0
        ? segments.map((s) => s.content).join('\n\n')
        : (episode.transcript_text ?? '');
    copyToClipboard(`${body}\n\n— ${episode.title}`);
  };

  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) {
      setTranscriptOverflows(false);
      return;
    }
    // scrollHeight reflects the full content even while the clamp is applied.
    setTranscriptOverflows(el.scrollHeight - el.clientHeight > 4);
  }, [episode.transcript_status, segments, episode.transcript_text]);

  const seekTo = (seconds: number | null) => {
    if (seconds == null) return;
    if (videoId) {
      setVideoStart(seconds);
    } else if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      void audioRef.current.play();
    }
  };

  // Arriving from transcript search (?t=): seek the media to that moment once.
  const seekedRef = useRef(false);
  useEffect(() => {
    if (seekedRef.current || initialSeek == null) return;
    seekedRef.current = true;
    seekTo(initialSeek);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSeek]);

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
      ) : (
        <div className={styles.audioMedia}>
          {episode.image_url ? (
            <img className={styles.artwork} src={episode.image_url} alt="" />
          ) : (
            <div className={styles.artworkPlaceholder}>
              <div className={styles.placeholderTop}>
                <BtsLogo size={22} />
                <span className={styles.placeholderKicker}>Podcasts</span>
              </div>
              <div className={styles.placeholderBody}>
                <p className={styles.placeholderTitle}>{episode.title}</p>
                {sourceName && <span className={styles.placeholderSource}>{sourceName}</span>}
              </div>
            </div>
          )}
          {episode.audio_url && (
            <AudioPlayer
              src={episode.audio_url}
              audioRef={audioRef}
              durationFallback={episode.duration_seconds}
            />
          )}
        </div>
      )}

      {description && <p className={styles.description}>{description}</p>}

      <div className={styles.body}>
        {/* ── Transcript ── */}
        <div className={styles.transcriptCol}>
          {(() => {
            const hasContent = segments.length > 0 || Boolean(episode.transcript_text);
            const isAvailable = episode.transcript_status === 'available';
            return (
              <>
                <div className={styles.transcriptHead}>
                  <h2 className={styles.sectionTitle}>Transcript</h2>
                  {isAvailable && hasContent && (
                    <button type="button" className={styles.copyAll} onClick={copyTranscript}>
                      <Copy size={14} strokeWidth={1.5} />
                      Copy transcript
                    </button>
                  )}
                </div>

                {!isAvailable ? (
                  <p className={styles.stateNote}>
                    {episode.transcript_status === 'failed'
                      ? episode.transcript_error ?? 'Transcription failed.'
                      : episode.transcript_status === 'skipped'
                        ? 'No free transcript was available and Deepgram was not enabled.'
                        : 'Transcript is still being resolved.'}
                  </p>
                ) : hasContent ? (
                  <>
                    <div className={styles.transcriptSearch}>
                      <Search size={16} strokeWidth={1.5} className={styles.searchIcon} />
                      <input
                        type="search"
                        className={styles.searchInput}
                        placeholder="Find in transcript"
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setActiveMatch(0);
                        }}
                        aria-label="Find in transcript"
                      />
                      {searchActive && (
                        <div className={styles.searchNav}>
                          <span className={styles.searchCount}>
                            {matchCount === 0 ? 'No matches' : `${activeMatch + 1} / ${matchCount}`}
                          </span>
                          <button
                            type="button"
                            className={styles.searchStep}
                            onClick={() => stepMatch(-1)}
                            disabled={matchCount === 0}
                            aria-label="Previous match"
                          >
                            <ChevronUp size={16} strokeWidth={1.5} />
                          </button>
                          <button
                            type="button"
                            className={styles.searchStep}
                            onClick={() => stepMatch(1)}
                            disabled={matchCount === 0}
                            aria-label="Next match"
                          >
                            <ChevronDown size={16} strokeWidth={1.5} />
                          </button>
                        </div>
                      )}
                    </div>

                    <div
                      ref={transcriptRef}
                      className={
                        transcriptClamped
                          ? `${styles.transcriptContent} ${styles.transcriptClamped} ${
                              transcriptOverflows ? styles.transcriptFaded : ''
                            }`
                          : styles.transcriptContent
                      }
                    >
                      {segments.length > 0 ? (
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
                                <button
                                  type="button"
                                  className={styles.copyButton}
                                  onClick={() => copySegment(s.content, s.speaker, s.start_seconds)}
                                  aria-label="Copy quote with citation"
                                >
                                  <Copy size={13} strokeWidth={1.5} />
                                </button>
                              </div>
                              <p className={styles.segmentText}>
                                <Highlighted text={s.content} query={query} />
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className={styles.plainTranscript}>
                          {episode.transcript_text!.split(/\n{2,}/).map((para, i) => (
                            <p key={i}>
                              <Highlighted text={para} query={query} />
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                    {transcriptOverflows && !searchActive && (
                      <button
                        type="button"
                        className={styles.transcriptToggle}
                        onClick={() => setTranscriptExpanded((v) => !v)}
                        aria-expanded={transcriptExpanded}
                      >
                        {transcriptExpanded ? 'Show less' : 'Show full transcript'}
                        <ChevronDown
                          size={16}
                          strokeWidth={1.5}
                          className={transcriptExpanded ? styles.chevOpen : undefined}
                        />
                      </button>
                    )}
                  </>
                ) : (
                  <p className={styles.stateNote}>Transcript text is not available.</p>
                )}
              </>
            );
          })()}
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

// Renders text with case-insensitive matches of `query` wrapped in <mark> so the
// in-transcript find can highlight and scroll to them.
function Highlighted({ text, query }: { text: string; query: string }) {
  const parts = highlightText(text, query);
  return (
    <>
      {parts.map((p, i) =>
        p.match ? (
          <mark key={i} className={styles.mark}>
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
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
