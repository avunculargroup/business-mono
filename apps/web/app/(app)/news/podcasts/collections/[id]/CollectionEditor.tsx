'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Layers, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField, FormTextarea } from '@/components/ui/FormField';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/providers/ToastProvider';
import { formatTimestamp } from '@/lib/podcasts';
import { formatDate } from '@/lib/utils';
import { NEWS_CATEGORY_LABELS } from '@platform/shared';
import type {
  PodcastCollection,
  PodcastCollectionEpisode,
  PodcastCollectionPickerEpisode,
} from '@platform/shared';
import {
  addEpisodeToCollection,
  deleteCollection,
  moveCollectionItem,
  removeCollectionItem,
  updateCollection,
} from '@/app/actions/podcastCollections';
import styles from '../collections.module.css';

interface Props {
  collection: PodcastCollection;
  episodes: PodcastCollectionEpisode[];
  pickerEpisodes: PodcastCollectionPickerEpisode[];
}

export function CollectionEditor({ collection, episodes, pickerEpisodes }: Props) {
  const router = useRouter();
  const { success, error } = useToast();

  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [busy, setBusy] = useState(false);

  // Run a mutation, surface the outcome, and re-fetch the server data on success
  // (the page is force-dynamic, so router.refresh re-renders with fresh props).
  const run = async (fn: () => Promise<{ error?: string; success?: boolean }>, ok?: string) => {
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if (result.error) {
      error(result.error);
      return false;
    }
    if (ok) success(ok);
    router.refresh();
    return true;
  };

  const onEdit = async (formData: FormData) => {
    const ok = await run(
      () =>
        updateCollection(collection.id, {
          title: String(formData.get('title') ?? ''),
          intro: String(formData.get('intro') ?? ''),
        }),
      'Collection updated',
    );
    if (ok) setEditing(false);
  };

  const onDelete = async () => {
    const ok = await run(() => deleteCollection(collection.id), 'Collection deleted');
    if (ok) router.push('/news/podcasts/collections');
  };

  const filteredPicker = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (q === '') return pickerEpisodes;
    return pickerEpisodes.filter((e) => e.title.toLowerCase().includes(q));
  }, [pickerEpisodes, pickerQuery]);

  return (
    <div className={styles.container}>
      <section className={styles.detailHeader}>
        <div className={styles.detailHeaderMain}>
          <h2 className={styles.detailTitle}>{collection.title}</h2>
          {collection.intro && <p className={styles.detailIntro}>{collection.intro}</p>}
          <p className={styles.detailMeta}>
            {episodes.length === 1 ? '1 episode' : `${episodes.length} episodes`}
          </p>
        </div>
        <div className={styles.detailActions}>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil size={16} strokeWidth={1.5} />
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)}>
            <Trash2 size={16} strokeWidth={1.5} />
            Delete
          </Button>
        </div>
      </section>

      <section className={styles.membersHeader}>
        <h3 className={styles.sectionTitle}>Episodes</h3>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus size={16} strokeWidth={1.5} />
          Add episodes
        </Button>
      </section>

      {episodes.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No episodes yet"
          description="Add approved episodes from the library to build the pack."
          actionLabel="Add episodes"
          onAction={() => setAdding(true)}
        />
      ) : (
        <ol className={styles.members}>
          {episodes.map((e, index) => (
            <li key={e.item_id} className={styles.member}>
              <div className={styles.memberOrder}>
                <button
                  type="button"
                  className={styles.orderButton}
                  aria-label="Move up"
                  disabled={busy || index === 0}
                  onClick={() => run(() => moveCollectionItem(collection.id, e.item_id, 'up'))}
                >
                  <ArrowUp size={16} strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  className={styles.orderButton}
                  aria-label="Move down"
                  disabled={busy || index === episodes.length - 1}
                  onClick={() => run(() => moveCollectionItem(collection.id, e.item_id, 'down'))}
                >
                  <ArrowDown size={16} strokeWidth={1.5} />
                </button>
              </div>
              <div className={styles.memberBody}>
                <Link href={`/news/podcasts/${e.slug}`} className={styles.memberTitle}>
                  {e.title}
                </Link>
                <div className={styles.memberMeta}>
                  {e.category && <span className={styles.categoryChip}>{NEWS_CATEGORY_LABELS[e.category]}</span>}
                  {e.source_name && <span>{e.source_name}</span>}
                  {e.duration_seconds != null && <span>{formatTimestamp(e.duration_seconds)}</span>}
                  {e.published_at && <span>{formatDate(e.published_at)}</span>}
                </div>
                {e.episode_summary && <p className={styles.memberSummary}>{e.episode_summary}</p>}
              </div>
              <button
                type="button"
                className={styles.removeButton}
                aria-label={`Remove ${e.title}`}
                disabled={busy}
                onClick={() => run(() => removeCollectionItem(e.item_id), 'Episode removed')}
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </li>
          ))}
        </ol>
      )}

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit collection"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" form="edit-collection-form" loading={busy}>Save</Button>
          </>
        }
      >
        <form id="edit-collection-form" action={onEdit} className={styles.form}>
          <FormField name="title" label="Title" required defaultValue={collection.title} maxLength={120} />
          <FormTextarea
            name="intro"
            label="Intro"
            hint="A sentence or two framing the pack. Optional."
            rows={3}
            defaultValue={collection.intro ?? ''}
          />
        </form>
      </Modal>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add episodes">
        {pickerEpisodes.length === 0 ? (
          <p className={styles.pickerEmpty}>
            Every approved episode is already in this collection. Approve more briefs to add them.
          </p>
        ) : (
          <>
            <input
              type="search"
              className={styles.pickerSearch}
              value={pickerQuery}
              onChange={(ev) => setPickerQuery(ev.target.value)}
              placeholder="Filter by title"
              aria-label="Filter episodes by title"
            />
            <ul className={styles.picker}>
              {filteredPicker.map((e) => (
                <li key={e.id} className={styles.pickerRow}>
                  <div className={styles.pickerInfo}>
                    <span className={styles.pickerTitle}>{e.title}</span>
                    <span className={styles.pickerMeta}>
                      {e.source_name && <span>{e.source_name}</span>}
                      {e.published_at && <span>{formatDate(e.published_at)}</span>}
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => run(() => addEpisodeToCollection(collection.id, e.id), 'Episode added')}
                  >
                    Add
                  </Button>
                </li>
              ))}
              {filteredPicker.length === 0 && <li className={styles.pickerEmpty}>No episodes match.</li>}
            </ul>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={onDelete}
        title="Delete collection"
        description={`Delete "${collection.title}"? The episodes stay in the library — only the pack is removed.`}
        confirmLabel="Delete"
        loading={busy}
      />
    </div>
  );
}
