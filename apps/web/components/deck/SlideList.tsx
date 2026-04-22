'use client';

import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { reorderSlides } from '@/app/actions/decks';
import { SlideThumbnail } from './SlideThumbnail';
import type { Slide, DeckSlideRow } from '@/lib/decks/schema';
import { parseSlideContent } from '@/lib/decks/schema';
import type { SlideTheme } from '@/lib/decks/theme';
import styles from './SlideList.module.css';

interface SlideListProps {
  deckId: string;
  slides: DeckSlideRow[];
  selectedSlideId: string | null;
  theme: SlideTheme;
  onSelectSlide: (id: string) => void;
  onSlidesReordered: (slides: DeckSlideRow[]) => void;
}

function SortableSlide({
  slide,
  index,
  isSelected,
  theme,
  onClick,
}: {
  slide: DeckSlideRow;
  index: number;
  isSelected: boolean;
  theme: SlideTheme;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const parsed: Slide = parseSlideContent(slide);

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <SlideThumbnail
        slide={parsed}
        theme={theme}
        thumbnailWidth={160}
        isSelected={isSelected}
        slideNumber={index + 1}
        onClick={onClick}
      />
    </div>
  );
}

export function SlideList({
  deckId,
  slides,
  selectedSlideId,
  theme,
  onSelectSlide,
  onSlidesReordered,
}: SlideListProps) {
  const [localSlides, setLocalSlides] = useState(slides);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Sync external changes (e.g. after add/delete)
  if (slides !== localSlides && slides.length !== localSlides.length) {
    setLocalSlides(slides);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localSlides.findIndex((s) => s.id === active.id);
    const newIndex  = localSlides.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(localSlides, oldIndex, newIndex);
    setLocalSlides(reordered);
    onSlidesReordered(reordered);

    await reorderSlides(deckId, reordered.map((s) => s.id));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={localSlides.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <div className={styles.list}>
          {localSlides.map((slide, i) => (
            <SortableSlide
              key={slide.id}
              slide={slide}
              index={i}
              isSelected={slide.id === selectedSlideId}
              theme={theme}
              onClick={() => onSelectSlide(slide.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
