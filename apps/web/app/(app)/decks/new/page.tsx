'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createDeck } from '@/app/actions/decks';
import { useToast } from '@/providers/ToastProvider';
import styles from './new.module.css';

export default function NewDeckPage() {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    startTransition(async () => {
      const res = await createDeck(title.trim());
      if ('error' in res) {
        toast.error(res.error);
      } else {
        router.push(`/decks/${res.id}/edit`);
      }
    });
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.heading}>New deck</h1>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label} htmlFor="title">
            Deck title
          </label>
          <input
            id="title"
            type="text"
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Q2 Bitcoin Treasury Briefing"
            autoFocus
            required
          />
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => router.back()}
              disabled={isPending}
            >
              Cancel
            </button>
            <button type="submit" className={styles.createBtn} disabled={isPending || !title.trim()}>
              {isPending ? 'Creating...' : 'Create deck'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
