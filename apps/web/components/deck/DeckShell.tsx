'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { addSlide } from '@/app/actions/decks';
import { getTheme } from '@/lib/decks/theme';
import { parseSlideContent } from '@/lib/decks/schema';
import type { DeckRow, DeckSlideRow, Slide } from '@/lib/decks/schema';
import { SlideFrame } from '@/components/slides/primitives/SlideFrame';
import { SlideView } from '@/components/slides/templates/SlideView';
import { SlideList } from './SlideList';
import { InspectorPanel } from './InspectorPanel';
import { TemplatePicker } from './TemplatePicker';
import { useToast } from '@/providers/ToastProvider';
import type { SlideType } from '@platform/shared';
import { SLIDE_WIDTH, SLIDE_HEIGHT } from '@/lib/decks/theme';
import styles from './DeckShell.module.css';

interface DeckShellProps {
  deck: DeckRow;
  initialSlides: DeckSlideRow[];
}

export function DeckShell({ deck, initialSlides }: DeckShellProps) {
  const router = useRouter();
  const toast = useToast();
  const theme = getTheme(deck.theme_id);

  const [slides, setSlides] = useState<DeckSlideRow[]>(initialSlides);
  const [selectedId, setSelectedId] = useState<string | null>(initialSlides[0]?.id ?? null);
  const [showPicker, setShowPicker] = useState(false);
  const [stageWidth, setStageWidth] = useState(0);

  const selectedSlide = slides.find((s) => s.id === selectedId) ?? null;
  const parsedSelected: Slide | null = selectedSlide ? parseSlideContent(selectedSlide) : null;

  // Compute scale to fit slide in available stage width
  const stageRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const obs = new ResizeObserver(([entry]) => {
      setStageWidth(entry.contentRect.width);
    });
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  const scale = stageWidth > 0 ? Math.min(1, (stageWidth - 48) / SLIDE_WIDTH) : 0;

  async function handleAddSlide(type: SlideType) {
    const res = await addSlide(deck.id, type);
    if ('error' in res) { toast.error(res.error); return; }
    setSlides((prev) => [...prev, res.slide]);
    setSelectedId(res.slide.id);
  }

  function handleContentChange(patch: Record<string, unknown>) {
    if (!selectedId) return;
    setSlides((prev) =>
      prev.map((s) =>
        s.id === selectedId
          ? { ...s, content_json: { ...(s.content_json as object), ...patch } }
          : s,
      ),
    );
  }

  function handleDeleted() {
    const remaining = slides.filter((s) => s.id !== selectedId);
    setSlides(remaining);
    setSelectedId(remaining[0]?.id ?? null);
  }

  function handleSlideDeletedFromList() {
    const remaining = slides.filter((s) => s.id !== selectedId);
    setSlides(remaining);
    setSelectedId(remaining[0]?.id ?? null);
  }

  function handleDuplicated(newId: string) {
    router.refresh();
    setSelectedId(newId);
  }

  return (
    <div className={styles.shell}>
      {/* Left panel: slide list */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <button
            type="button"
            className={styles.addBtn}
            onClick={() => setShowPicker(true)}
          >
            + Add slide
          </button>
        </div>
        <SlideList
          deckId={deck.id}
          slides={slides}
          selectedSlideId={selectedId}
          theme={theme}
          onSelectSlide={setSelectedId}
          onSlidesReordered={setSlides}
          onSlideDeleted={handleSlideDeletedFromList}
        />
      </div>

      {/* Centre: slide stage */}
      <div className={styles.stage} ref={stageRef}>
        {parsedSelected && scale > 0 ? (
          <div
            className={styles.stageCanvas}
            style={{ width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale }}
          >
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: SLIDE_WIDTH, height: SLIDE_HEIGHT }}>
              <SlideFrame theme={theme}>
                <SlideView slide={parsedSelected} theme={theme} />
              </SlideFrame>
            </div>
          </div>
        ) : (
          <div className={styles.emptyStage}>
            <p>Add a slide to get started</p>
            <button type="button" className={styles.addBtn} onClick={() => setShowPicker(true)}>
              + Add slide
            </button>
          </div>
        )}
      </div>

      {/* Right panel: inspector */}
      <div className={styles.inspector}>
        {selectedSlide && parsedSelected ? (
          <InspectorPanel
            deckId={deck.id}
            slide={selectedSlide}
            parsedSlide={parsedSelected}
            onDeleted={handleDeleted}
            onDuplicated={handleDuplicated}
            onContentChange={handleContentChange}
          />
        ) : (
          <div className={styles.emptyInspector}>Select a slide to edit its content</div>
        )}
      </div>

      {showPicker && (
        <TemplatePicker onSelect={handleAddSlide} onClose={() => setShowPicker(false)} />
      )}
    </div>
  );
}
