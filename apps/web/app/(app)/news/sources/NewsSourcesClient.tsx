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
import { Plus, Pencil, Trash2, ExternalLink, Rss, Mic, Youtube, Mail } from 'lucide-react';
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
};

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
        const link = r.feed_url ?? r.youtube_channel_url ?? r.site_url;
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
        if (r.source_type === 'rss') return <span className={styles.muted}>—</span>;
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
  });

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <p className={styles.intro}>
          Sources scanned daily for new content — article feeds, podcasts, YouTube channels, and email
          newsletters. Podcast and YouTube episodes are transcribed and embedded; newsletters are
          received at a per-source inbound address and ingested into the feed.
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
