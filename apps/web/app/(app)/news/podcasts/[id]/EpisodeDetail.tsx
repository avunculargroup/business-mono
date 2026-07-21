'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Copy, Search, ShieldCheck, ShieldAlert } from 'lucide-react';
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
import { requestEpisodeAction, generateEpisodeBrief, decideEpisodeBrief } from '@/app/actions/podcasts';
import { NEWS_CATEGORY_LABELS } from '@platform/shared';
import type { EpisodeChapter, EpisodeTakeaway, PodcastEpisode, TranscriptSegment } from '@platform/shared';
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

  // Episode brief (intelligence pass). `requested` is the optimistic "generating"
  // state after a request — the agent server writes the proposed summary async,
  // so the page shows it on the next load.
  const [briefPending, setBriefPending] = useState(false);
  const [requested, setRequested] = useState(false);

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
  // A takeaway timestamp can only deep-link when there's media to seek.
  const canSeek = Boolean(videoId || episode.audio_url);

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

  const generateBrief = async () => {
    setBriefPending(true);
    const result = await generateEpisodeBrief(episode.id);
    setBriefPending(false);
    if (result.error) return error(result.error);
    setRequested(true);
    success('Generating the brief — it appears here when it is ready');
    router.refresh();
  };

  const decideBrief = async (decision: 'approve' | 'reject') => {
    setBriefPending(true);
    const result = await decideEpisodeBrief(episode.id, decision);
    setBriefPending(false);
    if (result.error) return error(result.error);
    success(decision === 'approve' ? 'Brief published' : 'Draft rejected');
    router.refresh();
  };

  const verdict = episode.summary_lex_verdict;

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

      {/* ── Episode brief (intelligence pass) — C1: lead with the brief, not the
          raw show-notes, which are demoted below it. ── */}
      {episode.summary_status === 'approved' ? (
        <section className={styles.brief}>
          <div className={styles.briefHead}>
            <h2 className={styles.sectionTitle}>Episode brief</h2>
          </div>
          <p className={styles.briefText}>{episode.episode_summary}</p>
          <Takeaways takeaways={episode.key_takeaways} onSeek={seekTo} canSeek={canSeek} />
          <Chapters chapters={episode.chapters} onSeek={seekTo} canSeek={canSeek} />
        </section>
      ) : episode.summary_status === 'proposed' ? (
        <section className={`${styles.brief} ${styles.briefDraft}`}>
          <div className={styles.briefHead}>
            <h2 className={styles.sectionTitle}>Episode brief</h2>
            <span className={styles.briefBadge}>Draft · team only</span>
          </div>
          <p className={styles.briefText}>{episode.episode_summary}</p>
          <Takeaways takeaways={episode.key_takeaways} onSeek={seekTo} canSeek={canSeek} />
          <Chapters chapters={episode.chapters} onSeek={seekTo} canSeek={canSeek} />
          {verdict && (
            <div className={`${styles.verdict} ${verdict.passes ? styles.verdictPass : styles.verdictFlag}`}>
              <span className={styles.verdictLabel}>
                {verdict.passes ? (
                  <ShieldCheck size={15} strokeWidth={1.5} />
                ) : (
                  <ShieldAlert size={15} strokeWidth={1.5} />
                )}
                {verdict.passes ? 'Compliance cleared' : 'Compliance needs review'}
              </span>
              {verdict.rationale && <p className={styles.verdictRationale}>{verdict.rationale}</p>}
              {verdict.flags.length > 0 && (
                <ul className={styles.flagList}>
                  {verdict.flags.map((f, i) => (
                    <li key={i}>
                      <q>{f.quote}</q> — {f.issue}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className={styles.briefActions}>
            <Button size="sm" loading={briefPending} onClick={() => decideBrief('approve')}>
              Approve and publish
            </Button>
            <Button variant="secondary" size="sm" loading={briefPending} onClick={() => decideBrief('reject')}>
              Reject
            </Button>
            <Button variant="ghost" size="sm" loading={briefPending} onClick={generateBrief}>
              Regenerate
            </Button>
          </div>
        </section>
      ) : requested ? (
        <section className={styles.brief}>
          <p className={styles.stateNote}>Generating the brief — it appears here once it is ready.</p>
        </section>
      ) : episode.transcript_status === 'available' ? (
        <section className={styles.brief}>
          <div className={styles.briefHead}>
            <h2 className={styles.sectionTitle}>Episode brief</h2>
          </div>
          <p className={styles.stateNote}>
            No brief yet. Generate a short, compliance-reviewed summary a reader can skim instead of
            the full transcript.
          </p>
          <div className={styles.briefActions}>
            <Button size="sm" loading={briefPending} onClick={generateBrief}>
              Generate brief
            </Button>
          </div>
        </section>
      ) : null}

      {/* Raw show-notes — demoted below the brief (C1). */}
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
            {episode.category && <ProvRow label="Category" value={NEWS_CATEGORY_LABELS[episode.category]} />}
            {episode.relevance_score != null && (
              <ProvRow label="Relevance" value={episode.relevance_score.toFixed(2)} mono />
            )}
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

// Key takeaways for an episode brief. Each is a short point, optionally
// deep-linked to the moment it's discussed (when the transcript had timestamps
// and there's media to seek). Renders nothing when there are no takeaways.
function Takeaways({
  takeaways,
  onSeek,
  canSeek,
}: {
  takeaways: EpisodeTakeaway[];
  onSeek: (seconds: number | null) => void;
  canSeek: boolean;
}) {
  if (takeaways.length === 0) return null;
  return (
    <>
      <p className={styles.takeawaysTitle}>Key takeaways</p>
      <ul className={styles.takeaways}>
        {takeaways.map((t, i) => (
          <li key={i} className={styles.takeaway}>
            {t.start_seconds != null && (
              <button
                type="button"
                className={styles.takeawayStamp}
                onClick={() => onSeek(t.start_seconds)}
                disabled={!canSeek}
              >
                {formatTimestamp(t.start_seconds)}
              </button>
            )}
            <span>{t.text}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

// Chapter rail — a table of contents that jumps into the media. Each chapter has
// a real timestamp (anchorless ones are dropped at generation). Renders nothing
// when there are no chapters.
function Chapters({
  chapters,
  onSeek,
  canSeek,
}: {
  chapters: EpisodeChapter[];
  onSeek: (seconds: number | null) => void;
  canSeek: boolean;
}) {
  if (chapters.length === 0) return null;
  return (
    <>
      <p className={styles.takeawaysTitle}>Chapters</p>
      <ul className={styles.chapters}>
        {chapters.map((c, i) => (
          <li key={i}>
            <button
              type="button"
              className={styles.chapter}
              onClick={() => onSeek(c.start_seconds)}
              disabled={!canSeek}
            >
              <span className={styles.chapterStamp}>{formatTimestamp(c.start_seconds)}</span>
              <span className={styles.chapterTitle}>{c.title}</span>
            </button>
          </li>
        ))}
      </ul>
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
