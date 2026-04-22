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
}

export function SlideView({ slide, theme, imageUrl }: SlideViewProps) {
  switch (slide.type) {
    case 'title':         return <TitleSlideView content={slide.content} theme={theme} />;
    case 'section':       return <SectionSlideView content={slide.content} theme={theme} />;
    case 'agenda':        return <AgendaSlideView content={slide.content} theme={theme} />;
    case 'two_column':    return <TwoColumnSlideView content={slide.content} theme={theme} />;
    case 'image_caption': return <ImageCaptionSlideView content={slide.content} theme={theme} imageUrl={imageUrl} />;
    case 'kpi_grid':      return <KpiGridSlideView content={slide.content} theme={theme} />;
    case 'quote':         return <QuoteSlideView content={slide.content} theme={theme} />;
    case 'closing':       return <ClosingSlideView content={slide.content} theme={theme} />;
  }
}
