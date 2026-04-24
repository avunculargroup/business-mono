'use client';

import { useState, useTransition } from 'react';
import { SLIDE_TYPE_LABELS } from '@platform/shared';
import { updateSlide, deleteSlide, duplicateSlide } from '@/app/actions/decks';
import type { Slide, DeckSlideRow } from '@/lib/decks/schema';
import { useToast } from '@/providers/ToastProvider';
import { TitleInspector } from './inspectors/TitleInspector';
import { SectionInspector } from './inspectors/SectionInspector';
import { AgendaInspector } from './inspectors/AgendaInspector';
import { TwoColumnInspector } from './inspectors/TwoColumnInspector';
import { ImageCaptionInspector } from './inspectors/ImageCaptionInspector';
import { KpiGridInspector } from './inspectors/KpiGridInspector';
import { QuoteInspector } from './inspectors/QuoteInspector';
import { ClosingInspector } from './inspectors/ClosingInspector';
import styles from './InspectorPanel.module.css';

interface InspectorPanelProps {
  deckId: string;
  slide: DeckSlideRow;
  parsedSlide: Slide;
  onDeleted: () => void;
  onDuplicated: (newId: string) => void;
  onContentChange: (patch: Record<string, unknown>) => void;
}

export function InspectorPanel({
  deckId,
  slide,
  parsedSlide,
  onDeleted,
  onDuplicated,
  onContentChange,
}: InspectorPanelProps) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState(slide.notes ?? '');

  async function handleSaveNotes() {
    const res = await updateSlide(deckId, slide.id, {});
    if ('error' in res) toast.error(res.error);
  }

  function handleDelete() {
    if (!confirm('Delete this slide?')) return;
    startTransition(async () => {
      const res = await deleteSlide(deckId, slide.id);
      if ('error' in res) toast.error(res.error);
      else onDeleted();
    });
  }

  function handleDuplicate() {
    startTransition(async () => {
      const res = await duplicateSlide(deckId, slide.id);
      if ('error' in res) toast.error(res.error);
      else if ('id' in res) onDuplicated(res.id);
    });
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.type}>{SLIDE_TYPE_LABELS[parsedSlide.type as keyof typeof SLIDE_TYPE_LABELS]}</span>
        <div className={styles.actions}>
          <button type="button" className={styles.actionBtn} onClick={handleDuplicate} disabled={isPending} title="Duplicate slide">
            ⊕
          </button>
          <button type="button" className={`${styles.actionBtn} ${styles.danger}`} onClick={handleDelete} disabled={isPending} title="Delete slide" aria-label="Delete slide">
            <span>Delete</span>
          </button>
        </div>
      </div>

      <div className={styles.body}>
        <InspectorForType
          slide={parsedSlide}
          deckId={deckId}
          slideId={slide.id}
          onContentChange={onContentChange}
        />

        <div className={styles.section}>
          <label className={styles.label}>Speaker notes</label>
          <textarea
            className={styles.notes}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleSaveNotes}
            rows={4}
            placeholder="Notes for the presenter (not shown on slide)..."
          />
        </div>
      </div>
    </div>
  );
}

function InspectorForType({
  slide,
  deckId,
  slideId,
  onContentChange,
}: {
  slide: Slide;
  deckId: string;
  slideId: string;
  onContentChange: (patch: Record<string, unknown>) => void;
}) {
  const props = { deckId, slideId, onContentChange };

  switch (slide.type) {
    case 'title':         return <TitleInspector content={slide.content} {...props} />;
    case 'section':       return <SectionInspector content={slide.content} {...props} />;
    case 'agenda':        return <AgendaInspector content={slide.content} {...props} />;
    case 'two_column':    return <TwoColumnInspector content={slide.content} {...props} />;
    case 'image_caption': return <ImageCaptionInspector content={slide.content} {...props} />;
    case 'kpi_grid':      return <KpiGridInspector content={slide.content} {...props} />;
    case 'quote':         return <QuoteInspector content={slide.content} {...props} />;
    case 'closing':       return <ClosingInspector content={slide.content} {...props} />;
  }
}
