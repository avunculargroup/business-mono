'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Layers, Plus } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { FormField, FormTextarea } from '@/components/ui/FormField';
import { useToast } from '@/providers/ToastProvider';
import { formatDate } from '@/lib/utils';
import { createCollection } from '@/app/actions/podcastCollections';
import type { PodcastCollectionCard } from '@platform/shared';
import styles from './collections.module.css';

interface Props {
  collections: PodcastCollectionCard[];
}

export function CollectionsIndex({ collections }: Props) {
  const router = useRouter();
  const { success, error } = useToast();
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onCreate = async (formData: FormData) => {
    setSubmitting(true);
    const result = await createCollection(formData);
    setSubmitting(false);
    if (result.error) {
      error(result.error);
      return;
    }
    success('Collection created');
    setCreating(false);
    if (result.slug) router.push(`/news/podcasts/collections/${result.slug}`);
  };

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <p className={styles.lede}>
          Curated packs of episodes — a theme, a short intro, an ordered reading list.
        </p>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} strokeWidth={1.5} />
          New collection
        </Button>
      </div>

      {collections.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No collections yet"
          description="Group episodes into a briefing pack — start with a theme like custody or the accounting debate."
          actionLabel="New collection"
          onAction={() => setCreating(true)}
        />
      ) : (
        <ul className={styles.grid}>
          {collections.map((c) => (
            <li key={c.id} className={styles.card}>
              <Link href={`/news/podcasts/collections/${c.slug}`} className={styles.cardLink}>
                <h3 className={styles.cardTitle}>{c.title}</h3>
                {c.intro && <p className={styles.cardIntro}>{c.intro}</p>}
                <div className={styles.cardMeta}>
                  <span>{c.episode_count === 1 ? '1 episode' : `${c.episode_count} episodes`}</span>
                  <span>Updated {formatDate(c.updated_at)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New collection"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" form="new-collection-form" loading={submitting}>Create</Button>
          </>
        }
      >
        <form
          id="new-collection-form"
          action={onCreate}
          className={styles.form}
        >
          <FormField
            name="title"
            label="Title"
            required
            placeholder="The state of Bitcoin custody"
            maxLength={120}
          />
          <FormTextarea
            name="intro"
            label="Intro"
            hint="A sentence or two framing the pack. Optional."
            rows={3}
            placeholder="Why these episodes, and what to take from them."
          />
        </form>
      </Modal>
    </div>
  );
}
