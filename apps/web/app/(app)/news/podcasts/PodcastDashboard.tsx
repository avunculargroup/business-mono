'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { MediaEmbed } from '@/components/podcasts/MediaEmbed';
import { useOptimisticList } from '@/hooks/useOptimisticList';
import { useToast } from '@/providers/ToastProvider';
import { formatRelativeDate, formatDate } from '@/lib/utils';
import {
  formatTimestamp,
  estimateDeepgramCost,
  formatAud,
  TRANSCRIPT_STATUS_LABELS,
  TRANSCRIPT_STATUS_COLORS,
  TRANSCRIPT_SOURCE_LABELS,
} from '@/lib/podcasts';
import { requestEpisodeAction, ingestEpisodeBrief } from '@/app/actions/podcasts';
import type { TranscriptStatus, TranscriptSource } from '@platform/shared';
import { Library, FileCheck2, Loader, AlertTriangle, Plus, Database } from 'lucide-react';
import type { RowAction } from '@/components/ui/RowActionsMenu';
import styles from './podcasts.module.css';

export interface DashboardEpisode {
  id: string;
  title: string;
  published_at: string | null;
  transcript_status: TranscriptStatus;
  transcript_source: TranscriptSource | null;
  has_timestamps: boolean;
  embedded_at: string | null;
  transcript_error: string | null;
  youtube_url: string | null;
  audio_url: string | null;
  source_name: string | null;
  created_at: string | null;
  duration_seconds: number | null;
  topic_tags: string[];
}

export interface FeedHealth {
  name: string;
  source_type: string;
  transcribe_with_deepgram: boolean;
  last_scanned_at: string | null;
  episodes: number;
  coverage: number;
}

interface Props {
  episodes: DashboardEpisode[];
  feeds: FeedHealth[];
}

const IN_PROGRESS: TranscriptStatus[] = ['resolving', 'transcribing'];
const NEEDS_ATTENTION: TranscriptStatus[] = ['failed', 'skipped'];

export function PodcastDashboard({ episodes: initial, feeds }: Props) {
  const router = useRouter();
  const { success, error } = useToast();
  const { items: episodes, optimisticUpdate } = useOptimisticList(initial);

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [transcriptFilter, setTranscriptFilter] = useState<string>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [showBrief, setShowBrief] = useState(false);
  const [submittingBrief, setSubmittingBrief] = useState(false);

  // ── Aggregates ──────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    let available = 0;
    let inProgress = 0;
    let needsAttention = 0;
    let indexed = 0;
    for (const e of episodes) {
      if (e.transcript_status === 'available') available += 1;
      if (IN_PROGRESS.includes(e.transcript_status)) inProgress += 1;
      if (NEEDS_ATTENTION.includes(e.transcript_status)) needsAttention += 1;
      if (e.embedded_at) indexed += 1;
    }
    return { total: episodes.length, available, inProgress, needsAttention, indexed };
  }, [episodes]);

  // Estimated realized Deepgram spend (paid transcriptions only) — the money the
  // source-count gauge hides. See estimateDeepgramCost for the rate/assumptions.
  const spend = useMemo(() => estimateDeepgramCost(episodes), [episodes]);

  const sourceBreakdown = useMemo(() => {
    let feedTag = 0;
    let youtube = 0;
    let deepgram = 0;
    for (const e of episodes) {
      if (e.transcript_status !== 'available') continue;
      if (e.transcript_source === 'feed_tag') feedTag += 1;
      else if (e.transcript_source === 'youtube') youtube += 1;
      else if (e.transcript_source === 'deepgram') deepgram += 1;
    }
    const none = episodes.length - feedTag - youtube - deepgram;
    return { feedTag, youtube, deepgram, none, total: episodes.length };
  }, [episodes]);

  const timeline = useMemo(() => dailyCounts(episodes, 30), [episodes]);

  const sourceNames = useMemo(
    () => Array.from(new Set(episodes.map((e) => e.source_name).filter(Boolean))) as string[],
    [episodes],
  );
  const topics = useMemo(
    () => Array.from(new Set(episodes.flatMap((e) => e.topic_tags))).sort(),
    [episodes],
  );

  const recent = useMemo(
    () =>
      [...episodes]
        .filter((e) => e.youtube_url || e.audio_url)
        .sort((a, b) => byRecency(b) - byRecency(a))
        .slice(0, 4),
    [episodes],
  );

  const filtered = useMemo(
    () =>
      episodes.filter((e) => {
        if (statusFilter !== 'all' && e.transcript_status !== statusFilter) return false;
        if (sourceFilter !== 'all' && e.source_name !== sourceFilter) return false;
        if (transcriptFilter === 'yes' && e.transcript_status !== 'available') return false;
        if (transcriptFilter === 'no' && e.transcript_status === 'available') return false;
        if (topicFilter !== 'all' && !e.topic_tags.includes(topicFilter)) return false;
        return true;
      }),
    [episodes, statusFilter, sourceFilter, transcriptFilter, topicFilter],
  );

  // ── Per-row actions ──────────────────────────────────────────────────────────
  const runAction = (id: string, action: 'refetch' | 'deepgram' | 'retry', label: string) => {
    optimisticUpdate(id, { transcript_status: 'resolving' }, async () => {
      const result = await requestEpisodeAction(id, action);
      if (result.error) error(result.error);
      else success(label);
    });
  };

  const rowActions = (e: DashboardEpisode): RowAction[] => {
    const actions: RowAction[] = [
      { label: 'Fetch transcript', onClick: () => runAction(e.id, 'refetch', 'Re-running the transcript waterfall') },
    ];
    if (e.transcript_source !== 'deepgram') {
      actions.push({
        label: 'Transcribe with Deepgram',
        onClick: () => runAction(e.id, 'deepgram', 'Submitting to Deepgram'),
      });
    }
    if (e.transcript_status === 'failed') {
      actions.push({ label: 'Retry', onClick: () => runAction(e.id, 'retry', 'Retrying') });
    }
    return actions;
  };

  const columns: Column<DashboardEpisode>[] = [
    {
      key: 'title',
      header: 'Episode',
      render: (e) => (
        <div className={styles.titleCell}>
          <span className={styles.titleText}>{e.title}</span>
          {e.source_name && <span className={styles.sourceChip}>{e.source_name}</span>}
        </div>
      ),
    },
    {
      key: 'published',
      header: 'Published',
      render: (e) =>
        e.published_at ? (
          <span className={styles.muted}>{formatDate(e.published_at)}</span>
        ) : (
          <span className={styles.muted}>—</span>
        ),
      width: '130px',
    },
    {
      key: 'status',
      header: 'Status',
      render: (e) => (
        <StatusChip
          label={TRANSCRIPT_STATUS_LABELS[e.transcript_status]}
          color={TRANSCRIPT_STATUS_COLORS[e.transcript_status]}
        />
      ),
      width: '120px',
    },
    {
      key: 'source',
      header: 'Transcript',
      render: (e) =>
        e.transcript_source ? (
          <span className={styles.muted}>
            {TRANSCRIPT_SOURCE_LABELS[e.transcript_source]}
            {e.transcript_status === 'available' && !e.embedded_at && (
              <span className={styles.notIndexed} title="Transcript stored but not yet in the research index">
                {' '}· not indexed
              </span>
            )}
          </span>
        ) : (
          <span className={styles.muted}>—</span>
        ),
      width: '150px',
    },
    {
      key: 'duration',
      header: 'Duration',
      align: 'right',
      render: (e) => <span className={styles.mono}>{formatTimestamp(e.duration_seconds) || '—'}</span>,
      width: '100px',
    },
  ];

  const handleBrief = async (formData: FormData) => {
    setSubmittingBrief(true);
    const result = await ingestEpisodeBrief(formData);
    setSubmittingBrief(false);
    if (result.error) return error(result.error);
    success('Episode queued for ingestion');
    setShowBrief(false);
    router.refresh();
  };

  return (
    <div className={styles.container}>
      {/* ── KPI row ── */}
      <div className={styles.kpiRow}>
        <KpiCard icon={<Library size={18} strokeWidth={1.5} />} label="Episodes" value={kpis.total} headline />
        <KpiCard icon={<FileCheck2 size={18} strokeWidth={1.5} />} label="Transcripts available" value={kpis.available} />
        <KpiCard icon={<Database size={18} strokeWidth={1.5} />} label="In research index" value={kpis.indexed} />
        <KpiCard icon={<Loader size={18} strokeWidth={1.5} />} label="In progress" value={kpis.inProgress} />
        <KpiCard
          icon={<AlertTriangle size={18} strokeWidth={1.5} />}
          label="Needs attention"
          value={kpis.needsAttention}
        />
      </div>

      <div className={styles.chartsRow}>
        {/* ── Transcript-source breakdown / spend gauge ── */}
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Where transcripts come from</h2>
          <p className={styles.panelHint}>
            More warning-coloured means more Deepgram spend. Free sources keep the bar gold and green.
          </p>
          <StackedBar breakdown={sourceBreakdown} />
          <div className={styles.spendReadout}>
            <span className={styles.spendLabel}>Est. Deepgram spend</span>
            <span className={styles.spendFigures}>
              <span className={styles.mono}>{formatAud(spend.thisMonth)}</span> this month
              <span className={styles.feedDivider}>·</span>
              <span className={styles.mono}>{formatAud(spend.allTime)}</span> all time
            </span>
          </div>
        </section>

        {/* ── Ingestion over time ── */}
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Ingested over 30 days</h2>
          <p className={styles.panelHint}>A gap means the daily routine did not run.</p>
          <AreaChart points={timeline} />
        </section>
      </div>

      {/* ── Per-feed health ── */}
      {feeds.length > 0 && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Feed health</h2>
          <div className={styles.feedGrid}>
            {feeds.map((f) => (
              <div key={f.name} className={styles.feedCard}>
                <div className={styles.feedHead}>
                  <span className={styles.feedName}>{f.name}</span>
                  {f.source_type === 'podcast' && (
                    <span className={styles.deepgramDot}>
                      <span className={`${styles.dot} ${f.transcribe_with_deepgram ? styles.dotOn : ''}`} />
                      Deepgram {f.transcribe_with_deepgram ? 'on' : 'off'}
                    </span>
                  )}
                </div>
                <div className={styles.feedStats}>
                  <span className={styles.mono}>{f.episodes}</span> episodes
                  <span className={styles.feedDivider}>·</span>
                  <span className={styles.mono}>{f.coverage}%</span> transcribed
                </div>
                <div className={styles.feedRun}>
                  Last run {f.last_scanned_at ? formatRelativeDate(f.last_scanned_at) : 'never'}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Recent episodes with media ── */}
      {recent.length > 0 && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Recent episodes</h2>
          <div className={styles.recentGrid}>
            {recent.map((e) => (
              <div key={e.id} className={styles.recentCard}>
                <MediaEmbed youtubeUrl={e.youtube_url} audioUrl={e.audio_url} title={e.title} />
                <div className={styles.recentMeta}>
                  <Link href={`/news/podcasts/${e.id}`} className={styles.recentTitle}>
                    {e.title}
                  </Link>
                  <div className={styles.recentSub}>
                    {e.source_name && <span className={styles.sourceChip}>{e.source_name}</span>}
                    <StatusChip
                      label={TRANSCRIPT_STATUS_LABELS[e.transcript_status]}
                      color={TRANSCRIPT_STATUS_COLORS[e.transcript_status]}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Episode list ── */}
      <section className={styles.panel}>
        <div className={styles.listHead}>
          <h2 className={styles.panelTitle}>All episodes</h2>
          <Button variant="secondary" onClick={() => setShowBrief(true)}>
            <Plus size={16} strokeWidth={1.5} />
            Ingest an episode
          </Button>
        </div>

        <div className={styles.filters}>
          <Select label="Status" value={statusFilter} onChange={setStatusFilter}
            options={[['all', 'All statuses'], ...statusOptions()]} />
          <Select label="Source" value={sourceFilter} onChange={setSourceFilter}
            options={[['all', 'All sources'], ...sourceNames.map((s) => [s, s] as [string, string])]} />
          <Select label="Transcript" value={transcriptFilter} onChange={setTranscriptFilter}
            options={[['all', 'Any'], ['yes', 'Has transcript'], ['no', 'No transcript']]} />
          {topics.length > 0 && (
            <Select label="Topic" value={topicFilter} onChange={setTopicFilter}
              options={[['all', 'All topics'], ...topics.map((t) => [t, t] as [string, string])]} />
          )}
        </div>

        <DataTable<DashboardEpisode>
          columns={columns}
          data={filtered}
          rowKey={(e) => e.id}
          onRowClick={(e) => router.push(`/news/podcasts/${e.id}`)}
          rowActions={rowActions}
          emptyState={<span>No episodes match these filters.</span>}
        />
      </section>

      <Modal open={showBrief} onClose={() => setShowBrief(false)} title="Ingest an episode" size="md">
        <BriefForm submitting={submittingBrief} onSubmit={handleBrief} onCancel={() => setShowBrief(false)} />
      </Modal>
    </div>
  );
}

// ── Small presentational helpers ───────────────────────────────────────────────

function KpiCard({
  icon,
  label,
  value,
  headline,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  headline?: boolean;
}) {
  return (
    <div className={`${styles.kpiCard} ${headline ? styles.kpiHeadline : ''}`}>
      <span className={styles.kpiIcon}>{icon}</span>
      <span className={styles.kpiValue}>{value}</span>
      <span className={styles.kpiLabel}>{label}</span>
    </div>
  );
}

function StackedBar({
  breakdown,
}: {
  breakdown: { feedTag: number; youtube: number; deepgram: number; none: number; total: number };
}) {
  const { feedTag, youtube, deepgram, none, total } = breakdown;
  if (total === 0) return <p className={styles.empty}>No episodes ingested yet.</p>;
  const pct = (n: number) => `${(n / total) * 100}%`;
  const segments: { key: string; label: string; n: number; cls: string }[] = [
    { key: 'feed', label: 'Publisher feed', n: feedTag, cls: styles.segFeed },
    { key: 'yt', label: 'YouTube', n: youtube, cls: styles.segYoutube },
    { key: 'dg', label: 'Deepgram', n: deepgram, cls: styles.segDeepgram },
    { key: 'none', label: 'Skipped / none', n: none, cls: styles.segNone },
  ];
  return (
    <div>
      <div className={styles.bar}>
        {segments
          .filter((s) => s.n > 0)
          .map((s) => (
            <div key={s.key} className={`${styles.barSeg} ${s.cls}`} style={{ width: pct(s.n) }} title={`${s.label}: ${s.n}`} />
          ))}
      </div>
      <div className={styles.legend}>
        {segments.map((s) => (
          <span key={s.key} className={styles.legendItem}>
            <span className={`${styles.legendSwatch} ${s.cls}`} />
            {s.label} <span className={styles.mono}>{s.n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function AreaChart({ points }: { points: { date: string; count: number }[] }) {
  const W = 320;
  const H = 96;
  const pad = 4;
  const max = Math.max(1, ...points.map((p) => p.count));
  const stepX = points.length > 1 ? (W - pad * 2) / (points.length - 1) : 0;
  const xy = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = H - pad - (p.count / max) * (H - pad * 2);
    return [x, y] as const;
  });
  if (xy.length === 0) return <p className={styles.empty}>No ingestion history yet.</p>;
  const line = xy.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${xy[xy.length - 1]![0].toFixed(1)} ${H - pad} L${xy[0]![0].toFixed(1)} ${H - pad} Z`;
  return (
    <div className={styles.chartWrap}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chartSvg} preserveAspectRatio="none" role="img" aria-label="Episodes ingested per day">
        <path d={area} className={styles.chartArea} />
        <path d={line} className={styles.chartLine} />
      </svg>
      <div className={styles.chartAxis}>
        <span className={styles.mono}>{points[0]?.date}</span>
        <span className={styles.mono}>{points[points.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className={styles.selectWrap}>
      <span className={styles.selectLabel}>{label}</span>
      <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function BriefForm({
  submitting,
  onSubmit,
  onCancel,
}: {
  submitting: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
}) {
  const [allowDeepgram, setAllowDeepgram] = useState(false);
  return (
    <form
      className={styles.briefForm}
      action={(fd) => {
        fd.set('allow_deepgram', allowDeepgram ? 'true' : 'false');
        onSubmit(fd);
      }}
    >
      <p className={styles.briefIntro}>
        Paste an audio or YouTube URL and a short note on why it is worth ingesting. The transcript
        waterfall runs once, and the result joins the research index.
      </p>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Title (optional)</label>
        <input name="title" className={styles.input} placeholder="Episode title" />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>YouTube URL</label>
        <input name="youtube_url" type="url" className={styles.input} placeholder="https://youtube.com/watch?v=…" />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Audio URL</label>
        <input name="audio_url" type="url" className={styles.input} placeholder="https://…/episode.mp3" />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Why ingest this</label>
        <textarea name="why" className={styles.textarea} rows={2} placeholder="Context for the index" required />
      </div>
      <label className={styles.switchRow}>
        <input type="checkbox" checked={allowDeepgram} onChange={(e) => setAllowDeepgram(e.target.checked)} />
        <span>Allow Deepgram if no free transcript exists</span>
      </label>
      {allowDeepgram && (
        <p className={styles.moneyWarning}>
          Deepgram transcription is billed per minute of audio. Used only when no free transcript is available.
        </p>
      )}
      <div className={styles.formActions}>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={submitting}>Ingest episode</Button>
      </div>
    </form>
  );
}

// ── Pure helpers ────────────────────────────────────────────────────────────────

function statusOptions(): [string, string][] {
  return (Object.keys(TRANSCRIPT_STATUS_LABELS) as TranscriptStatus[]).map((s) => [s, TRANSCRIPT_STATUS_LABELS[s]]);
}

function byRecency(e: DashboardEpisode): number {
  const d = e.published_at ?? e.created_at;
  return d ? new Date(d).getTime() : 0;
}

// Episodes ingested per day over the trailing N days (by created_at).
function dailyCounts(episodes: DashboardEpisode[], days: number): { date: string; count: number }[] {
  const buckets = new Map<string, number>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    buckets.set(dayKey(d), 0);
  }
  for (const e of episodes) {
    if (!e.created_at) continue;
    const key = dayKey(new Date(e.created_at));
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([date, count]) => ({ date: shortDay(date), count }));
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shortDay(key: string): string {
  return key.slice(5); // MM-DD
}
