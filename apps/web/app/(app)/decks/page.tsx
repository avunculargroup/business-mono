import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { getDecks } from '@/app/actions/decks';
import { DECK_STATUS_LABELS } from '@platform/shared';
import type { DeckRow } from '@/lib/decks/schema';
import { formatDate } from '@/lib/utils';
import styles from './decks.module.css';

export const dynamic = 'force-dynamic';

export default async function DecksPage() {
  let decks: DeckRow[];
  try {
    decks = await getDecks();
  } catch {
    notFound();
  }

  return (
    <>
      <PageHeader title="Decks">
        <Link href="/decks/new" className={styles.newBtn}>
          New deck
        </Link>
      </PageHeader>

      <div className={styles.container}>
        {decks.length === 0 ? (
          <div className={styles.empty}>
            <p>No decks yet.</p>
            <Link href="/decks/new" className={styles.newBtn}>Create your first deck</Link>
          </div>
        ) : (
          <div className={styles.grid}>
            {decks.map((deck) => (
              <Link key={deck.id} href={`/decks/${deck.id}/edit`} className={styles.card}>
                <div className={styles.cardPreview}>
                  <span className={styles.cardIcon}>🎞</span>
                </div>
                <div className={styles.cardMeta}>
                  <span className={styles.cardTitle}>{deck.title}</span>
                  <div className={styles.cardSub}>
                    <span className={styles.statusChip} data-status={deck.status}>
                      {DECK_STATUS_LABELS[deck.status as keyof typeof DECK_STATUS_LABELS] ?? deck.status}
                    </span>
                    <span className={styles.cardDate}>{formatDate(deck.updated_at)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
