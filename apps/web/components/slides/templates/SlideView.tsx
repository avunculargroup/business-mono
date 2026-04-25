import type { Slide } from '@/lib/decks/schema';
import type { SlideTheme } from '@/lib/decks/theme';
import { TitleSlideView } from './TitleSlideView';
import { SectionSlideView } from './SectionSlideView';
import { AgendaSlideView } from './AgendaSlideView';
import { TwoColumnSlideView } from './TwoColumnSlideView';
import { ImageCaptionSlideView } from './ImageCaptionSlideView';
import { KpiGridSlideView } from './KpiGridSlideView';
import { QuoteSlideView } from './QuoteSlideView';
import { ClosingSlideView } from './ClosingSlideView';

interface SlideViewProps {
  slide: Slide;
  theme: SlideTheme;
  imageUrl?: string | null;
  slideIndex?: number;
  slideCount?: number;
  deckLabel?: string;
}

export function SlideView({ slide, theme, imageUrl, slideIndex, slideCount, deckLabel }: SlideViewProps) {
  const pos = { slideIndex, slideCount, deckLabel };
  switch (slide.type) {
    case 'title':         return <TitleSlideView content={slide.content} theme={theme} {...pos} />;
    case 'section':       return <SectionSlideView content={slide.content} theme={theme} {...pos} />;
    case 'agenda':        return <AgendaSlideView content={slide.content} theme={theme} {...pos} />;
    case 'two_column':    return <TwoColumnSlideView content={slide.content} theme={theme} {...pos} />;
    case 'image_caption': return <ImageCaptionSlideView content={slide.content} theme={theme} imageUrl={imageUrl} {...pos} />;
    case 'kpi_grid':      return <KpiGridSlideView content={slide.content} theme={theme} {...pos} />;
    case 'quote':         return <QuoteSlideView content={slide.content} theme={theme} {...pos} />;
    case 'closing':       return <ClosingSlideView content={slide.content} theme={theme} {...pos} />;
  }
}
