import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDeckWithSlides } from '@/app/actions/decks';
import { DeckShell } from '@/components/deck/DeckShell';
import styles from './edit.module.css';

interface Props {
  params: Promise<{ deckId: string }>;
}

export default async function EditDeckPage({ params }: Props) {
  const { deckId } = await params;
  const result = await getDeckWithSlides(deckId);

  if (!result) notFound();

  const { deck, slides } = result;

  return (
    <div className={styles.page}>
      <header className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Link href="/decks" className={styles.back}>← Decks</Link>
          <h1 className={styles.title}>{deck.title}</h1>
        </div>
        <div className={styles.toolbarRight}>
          <Link href={`/decks/${deckId}/present`} className={styles.presentBtn} target="_blank" rel="noopener noreferrer">
            Present ↗
          </Link>
          <a href={`/api/exports/${deckId}/pptx`} className={styles.exportBtn} download>
            Export PPTX
          </a>
        </div>
      </header>
      <DeckShell deck={deck} initialSlides={slides} />
    </div>
  );
}
