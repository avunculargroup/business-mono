'use client';

import { useState } from 'react';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { NewsSourceForm, type NewsSourceFormValues } from './NewsSourceForm';
import {
  createNewsSource,
  updateNewsSource,
  deleteNewsSource,
  toggleNewsSourceActive,
} from '@/app/actions/newsSources';
import { useOptimisticList } from '@/hooks/useOptimisticList';
import { formatRelativeDate } from '@/lib/utils';
import { useToast } from '@/providers/ToastProvider';
import { Plus, Pencil, Trash2, ExternalLink, Rss, Mic, Youtube, Mail, FileText } from 'lucide-react';
import type { RowAction } from '@/components/ui/RowActionsMenu';
import type { NewsSourceRecord, NewsSourceType } from '@platform/shared';
import styles from './sources.module.css';

export interface SourceStats {
  episodes: number;
  available: number;
}

interface Props {
  initialSources: NewsSourceRecord[];
  stats: Record<string, SourceStats>;
  inboundDomain: string;
}

function statusColor(status: string | null): 'neutral' | 'success' | 'destructive' {
  if (status === 'success') return 'success';
  if (status === 'failed') return 'destructive';
  return 'neutral';
}

const TYPE_META: Record<NewsSourceType, { label: string; icon: typeof Rss }> = {
  rss: { label: 'Article', icon: Rss },
  podcast: { label: 'Podcast', icon: Mic },
  youtube: { label: 'YouTube', icon: Youtube },
  email: { label: 'Email', icon: Mail },
  report_watch: { label: 'Reports', icon: FileText },
};

/** Newline/comma-separated list → trimmed array. */
function parseList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Assemble the detection_config JSONB from the form's flat fields. Only blocks
 * for selected strategies are written, so deselecting a strategy removes its
 * configuration rather than leaving stale keys behind.
 */
function buildDetectionConfig(v: NewsSourceFormValues): Record<string, unknown> {
  const cfg: Record<string, unknown> = {};
  const has = (s: string) => v.detection_strategies.includes(s as never);

  if (has('rss') && v.rss_feed_url.trim()) {
    cfg.rss = { feed_url: v.rss_feed_url.trim() };
  }
  if (has('sitemap') && v.sitemap_url.trim()) {
    cfg.sitemap = {
      sitemap_url: v.sitemap_url.trim(),
      ...(v.sitemap_path_prefix.trim() ? { path_prefix: v.sitemap_path_prefix.trim() } : {}),
      ...(parseList(v.sitemap_path_exclude).length
        ? { path_exclude: parseList(v.sitemap_path_exclude) }
        : {}),
    };
  }
  if (has('index_page') && v.index_url.trim()) {
    cfg.index_page = {
      index_url: v.index_url.trim(),
      item_selector: v.item_selector.trim(),
      ...(v.link_selector.trim() ? { link_selector: v.link_selector.trim() } : {}),
      ...(v.title_selector.trim() ? { title_selector: v.title_selector.trim() } : {}),
      ...(v.date_selector.trim() ? { date_selector: v.date_selector.trim() } : {}),
      follow_to_pdf: v.follow_to_pdf,
      ...(v.pdf_link_selector.trim() ? { pdf_link_selector: v.pdf_link_selector.trim() } : {}),
    };
  }
  const mustMatch = parseList(v.url_must_match);
  const mustNot = parseList(v.url_must_not_match);
  if (mustMatch.length || mustNot.length) {
    cfg.url_filters = {
      ...(mustMatch.length ? { must_match: mustMatch } : {}),
      ...(mustNot.length ? { must_not_match: mustNot } : {}),
    };
  }
  return cfg;
}

function valuesToFormData(v: NewsSourceFormValues): FormData {
  const fd = new FormData();
  fd.set('name', v.name);
  fd.set('source_type', v.source_type);
  fd.set('site_url', v.site_url);
  fd.set('feed_url', v.feed_url);
  fd.set('youtube_channel_url', v.youtube_channel_url);
  fd.set('is_active', v.is_active ? 'true' : 'false');
  fd.set('transcribe_with_deepgram', v.transcribe_with_deepgram ? 'true' : 'false');
  fd.set('preferred_transcript_lang', v.preferred_transcript_lang);
  fd.set('max_backfill_episodes', String(v.max_backfill_episodes));
  fd.set('max_episode_age_days', v.max_episode_age_days == null ? '' : String(v.max_episode_age_days));
  fd.set('slug', v.slug);
  fd.set('tier', v.tier);
  fd.set('relevance_threshold', String(v.relevance_threshold));
  fd.set('sender_allowlist', v.sender_allowlist);
  fd.set('follow_links', v.follow_links ? 'true' : 'false');
  fd.set('max_followed_links', String(v.max_followed_links));
  // Report watch. detection_config is assembled here rather than as a flat set
  // of form fields because the three strategies share almost nothing.
  fd.set('detection_strategies', v.detection_strategies.join(','));
  fd.set('detection_config', JSON.stringify(buildDetectionConfig(v)));
  fd.set('redistribution_default', v.redistribution_default);
  fd.set('licence_notes', v.licence_notes);
  fd.set('ocr_enabled', v.ocr_enabled ? 'true' : 'false');
  fd.set('ocr_page_limit', String(v.ocr_page_limit));
  fd.set('crawl_delay_seconds', String(v.crawl_delay_seconds));
  fd.set('max_candidates_per_run', String(v.max_candidates_per_run));
  return fd;
}

export function NewsSourcesClient({ initialSources, stats, inboundDomain }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [editSource, setEditSource] = useState<NewsSourceRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NewsSourceRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { success, error } = useToast();
  const { items: sources, optimisticUpdate, optimisticRemove } = useOptimisticList(initialSources);

  const handleCreate = async (values: NewsSourceFormValues) => {
    setSubmitting(true);
    const result = await createNewsSource(valuesToFormData(values));
    setSubmitting(false);
    if (result.error) return error(result.error);
    success('Source added');
    setShowCreate(false);
  };

  const handleUpdate = async (values: NewsSourceFormValues) => {
    if (!editSource) return;
    setSubmitting(true);
    const result = await updateNewsSource(editSource.id, valuesToFormData(values));
    setSubmitting(false);
    if (result.error) return error(result.error);
    success('Source updated');
    setEditSource(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const id = deleteTarget.id;
    const result = await deleteNewsSource(id);
    setIsDeleting(false);
    if (result.error) return error(result.error);
    success('Source removed');
    optimisticRemove(id, async () => {});
    setDeleteTarget(null);
  };

  const handleToggleActive = async (row: NewsSourceRecord) => {
    const next = !row.is_active;
    optimisticUpdate(row.id, { is_active: next }, async () => {
      const result = await toggleNewsSourceActive(row.id, next);
      if (result.error) error(result.error);
    });
  };

  const columns: Column<NewsSourceRecord>[] = [
    {
      key: 'name',
      header: 'Source',
      render: (r) => {
        const meta = TYPE_META[r.source_type] ?? TYPE_META.rss;
        const Icon = meta.icon;
        const indexUrl = (r.detection_config as { index_page?: { index_url?: string } } | null)
          ?.index_page?.index_url;
        const link = r.feed_url ?? r.youtube_channel_url ?? indexUrl ?? r.site_url;
        return (
          <div className={styles.nameCell}>
            <span className={styles.nameRow}>
              <span className={styles.nameText}>{r.name}</span>
              <span className={styles.typeChip}>
                <Icon size={11} strokeWidth={1.5} />
                {meta.label}
              </span>
            </span>
            {r.source_type === 'email' ? (
              r.inbound_address && <span className={styles.nameSub}>{r.inbound_address}</span>
            ) : (
              link && (
                <a
                  className={styles.nameSub}
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  {link} <ExternalLink size={11} strokeWidth={1.5} />
                </a>
              )
            )}
          </div>
        );
      },
    },
    {
      key: 'episodes',
      header: 'Episodes',
      render: (r) => {
        if (r.source_type === 'rss' || r.source_type === 'report_watch') {
          return <span className={styles.muted}>—</span>;
        }
        const s = stats[r.id] ?? { episodes: 0, available: 0 };
        const coverage = s.episodes > 0 ? Math.round((s.available / s.episodes) * 100) : 0;
        return (
          <div className={styles.episodesCell}>
            <span className={styles.mono}>{s.episodes}</span>
            {s.episodes > 0 && (
              <span className={styles.coverage}>
                <span className={styles.mono}>{coverage}%</span> transcribed
              </span>
            )}
          </div>
        );
      },
      width: '140px',
    },
    {
      key: 'deepgram',
      header: 'Deepgram',
      render: (r) =>
        r.source_type === 'podcast' ? (
          <span className={styles.deepgramCell}>
            <span className={`${styles.dot} ${r.transcribe_with_deepgram ? styles.dotOn : ''}`} />
            {r.transcribe_with_deepgram ? 'On' : 'Off'}
          </span>
        ) : (
          <span className={styles.muted}>—</span>
        ),
      width: '110px',
    },
    {
      key: 'last',
      header: 'Last scanned',
      render: (r) =>
        r.last_scanned_at ? (
          <div className={styles.lastCell}>
            <span className={styles.muted}>{formatRelativeDate(r.last_scanned_at)}</span>
            {r.last_status && <StatusChip label={r.last_status} color={statusColor(r.last_status)} />}
          </div>
        ) : (
          <span className={styles.muted}>Never</span>
        ),
      width: '190px',
    },
    {
      key: 'active',
      header: 'Active',
      render: (r) => (
        <label className={styles.toggle} onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={r.is_active} onChange={() => handleToggleActive(r)} />
          <span>{r.is_active ? 'On' : 'Off'}</span>
        </label>
      ),
      width: '80px',
    },
  ];

  const rowActions = (r: NewsSourceRecord): RowAction[] => [
    { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditSource(r) },
    { label: 'Delete', icon: <Trash2 size={14} />, onClick: () => setDeleteTarget(r), destructive: true },
  ];

  /** Unpack detection_config back into the form's flat fields. */
  const reportWatchValues = (r: NewsSourceRecord) => {
    const cfg = (r.detection_config ?? {}) as {
      rss?: { feed_url?: string };
      sitemap?: { sitemap_url?: string; path_prefix?: string; path_exclude?: string[] };
      index_page?: {
        index_url?: string;
        item_selector?: string;
        link_selector?: string;
        title_selector?: string;
        date_selector?: string;
        follow_to_pdf?: boolean;
        pdf_link_selector?: string;
      };
      url_filters?: { must_match?: string[]; must_not_match?: string[] };
    };
    return {
      detection_strategies: r.detection_strategies ?? [],
      rss_feed_url: cfg.rss?.feed_url ?? '',
      sitemap_url: cfg.sitemap?.sitemap_url ?? '',
      sitemap_path_prefix: cfg.sitemap?.path_prefix ?? '',
      sitemap_path_exclude: (cfg.sitemap?.path_exclude ?? []).join('\n'),
      index_url: cfg.index_page?.index_url ?? '',
      item_selector: cfg.index_page?.item_selector ?? '',
      link_selector: cfg.index_page?.link_selector ?? '',
      title_selector: cfg.index_page?.title_selector ?? '',
      date_selector: cfg.index_page?.date_selector ?? '',
      follow_to_pdf: cfg.index_page?.follow_to_pdf ?? false,
      pdf_link_selector: cfg.index_page?.pdf_link_selector ?? '',
      url_must_match: (cfg.url_filters?.must_match ?? []).join('\n'),
      url_must_not_match: (cfg.url_filters?.must_not_match ?? []).join('\n'),
      redistribution_default: r.redistribution_default ?? 'internal_only',
      licence_notes: r.licence_notes ?? '',
      ocr_enabled: r.ocr_enabled ?? false,
      ocr_page_limit: r.ocr_page_limit ?? 40,
      crawl_delay_seconds: r.crawl_delay_seconds ?? 5,
      max_candidates_per_run: r.max_candidates_per_run ?? 25,
    };
  };

  const initialValuesForEdit = (r: NewsSourceRecord): NewsSourceFormValues => ({
    name: r.name,
    source_type: r.source_type,
    site_url: r.site_url ?? '',
    feed_url: r.feed_url ?? '',
    youtube_channel_url: r.youtube_channel_url ?? '',
    is_active: r.is_active,
    transcribe_with_deepgram: r.transcribe_with_deepgram,
    preferred_transcript_lang: r.preferred_transcript_lang ?? 'en',
    max_backfill_episodes: r.max_backfill_episodes ?? 25,
    max_episode_age_days: r.max_episode_age_days,
    slug: r.slug ?? '',
    tier: r.tier ?? 'tier_2',
    relevance_threshold: r.relevance_threshold ?? 0.7,
    sender_allowlist: (r.sender_allowlist ?? []).join('\n'),
    follow_links: r.follow_links ?? false,
    max_followed_links: r.max_followed_links ?? 5,
    ...reportWatchValues(r),
  });

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <p className={styles.intro}>
          Sources scanned daily for new content — article feeds, podcasts, YouTube channels, email
          newsletters, and report publishers. Podcast and YouTube episodes are transcribed and embedded;
          newsletters are received at a per-source inbound address; report pages are watched for new PDFs,
          which are stored, extracted, and indexed.
        </p>
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={16} strokeWidth={1.5} />
          Add source
        </Button>
      </div>

      <DataTable<NewsSourceRecord>
        columns={columns}
        data={sources}
        rowKey={(r) => r.id}
        rowActions={rowActions}
        emptyState={<span>No sources yet. Add a publication, podcast, or channel to start scanning.</span>}
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add source" size="md">
        <NewsSourceForm onSubmit={handleCreate} submitting={submitting} onCancel={() => setShowCreate(false)} inboundDomain={inboundDomain} />
      </Modal>

      <Modal open={editSource !== null} onClose={() => setEditSource(null)} title="Edit source" size="md">
        {editSource && (
          <NewsSourceForm
            initialValues={initialValuesForEdit(editSource)}
            onSubmit={handleUpdate}
            submitting={submitting}
            onCancel={() => setEditSource(null)}
            inboundDomain={inboundDomain}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Remove source?"
        description={deleteTarget ? `"${deleteTarget.name}" will no longer be scanned.` : ''}
        confirmLabel="Remove"
        destructive
        loading={isDeleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
