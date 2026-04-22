import { notFound } from 'next/navigation';
import { getDeckWithSlides } from '@/app/actions/decks';
import { PresentMode } from '@/components/deck/PresentMode';

interface Props {
  params: Promise<{ deckId: string }>;
}

export default async function PresentDeckPage({ params }: Props) {
  const { deckId } = await params;
  const result = await getDeckWithSlides(deckId);
  if (!result) notFound();
  return <PresentMode deck={result.deck} slides={result.slides} />;
}
