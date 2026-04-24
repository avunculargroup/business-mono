'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
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
import { reorderSlides, deleteSlide } from '@/app/actions/decks';
import { SlideThumbnail } from './SlideThumbnail';
import type { Slide, DeckSlideRow } from '@/lib/decks/schema';
import { parseSlideContent } from '@/lib/decks/schema';
import type { SlideTheme } from '@/lib/decks/theme';
import { useToast } from '@/providers/ToastProvider';
import styles from './SlideList.module.css';

interface SlideListProps {
  deckId: string;
  slides: DeckSlideRow[];
  selectedSlideId: string | null;
  theme: SlideTheme;
  onSelectSlide: (id: string) => void;
  onSlidesReordered: (slides: DeckSlideRow[]) => void;
  onSlideDeleted?: () => void;
}

function SortableSlide({
  slide,
  index,
  isSelected,
  theme,
  onClick,
  deckId,
  onDelete,
  thumbnailWidth,
}: {
  slide: DeckSlideRow;
  index: number;
  isSelected: boolean;
  theme: SlideTheme;
  onClick: () => void;
  deckId: string;
  onDelete: () => void;
  thumbnailWidth: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id });
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const parsed: Slide = parseSlideContent(slide);

  async function handleDelete() {
    startTransition(async () => {
      const res = await deleteSlide(deckId, slide.id);
      if ('error' in res) {
        toast.error(res.error);
      } else {
        onDelete();
      }
    });
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <SlideThumbnail
        slide={parsed}
        theme={theme}
        thumbnailWidth={thumbnailWidth}
        isSelected={isSelected}
        slideNumber={index + 1}
        onClick={onClick}
        onDelete={isPending ? undefined : handleDelete}
      />
    </div>
  );
}

const MOBILE_BREAKPOINT = 768;
const MOBILE_LIST_PADDING = 20; // matches --space-5 (20px each side)
const DESKTOP_THUMBNAIL_WIDTH = 160;

export function SlideList({
  deckId,
  slides,
  selectedSlideId,
  theme,
  onSelectSlide,
  onSlidesReordered,
  onSlideDeleted,
}: SlideListProps) {
  const [localSlides, setLocalSlides] = useState(slides);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const listRef = useRef<HTMLDivElement>(null);
  const [thumbnailWidth, setThumbnailWidth] = useState(DESKTOP_THUMBNAIL_WIDTH);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const update = () => {
      if (window.innerWidth <= MOBILE_BREAKPOINT) {
        setThumbnailWidth(el.offsetWidth - MOBILE_LIST_PADDING * 2);
      } else {
        setThumbnailWidth(DESKTOP_THUMBNAIL_WIDTH);
      }
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, []);

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

  function handleSlideDeleted(deletedSlideId: string) {
    const remaining = localSlides.filter((s) => s.id !== deletedSlideId);
    setLocalSlides(remaining);
    onSlideDeleted?.();
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={localSlides.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <div className={styles.list} ref={listRef}>
          {localSlides.map((slide, i) => (
            <SortableSlide
              key={slide.id}
              slide={slide}
              index={i}
              isSelected={slide.id === selectedSlideId}
              theme={theme}
              onClick={() => onSelectSlide(slide.id)}
              deckId={deckId}
              onDelete={() => handleSlideDeleted(slide.id)}
              thumbnailWidth={thumbnailWidth}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
