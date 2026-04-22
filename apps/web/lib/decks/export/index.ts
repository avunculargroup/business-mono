import PptxGenJS from 'pptxgenjs';
import { getTheme } from '../theme';
import { parseSlideContent } from '../schema';
import type { DeckRow, DeckSlideRow } from '../schema';
import { addSlideMaster } from './masters';
import { exportTitleSlide } from './slides/title';
import { exportSectionSlide } from './slides/section';
import { exportAgendaSlide } from './slides/agenda';
import { exportTwoColumnSlide } from './slides/twoColumn';
import { exportImageCaptionSlide } from './slides/imageCaption';
import { exportKpiGridSlide } from './slides/kpiGrid';
import { exportQuoteSlide } from './slides/quote';
import { exportClosingSlide } from './slides/closing';

export async function generatePptx(deck: DeckRow, slides: DeckSlideRow[]): Promise<Buffer> {
  const pres = new PptxGenJS();
  const theme = getTheme(deck.theme_id);

  pres.layout = 'LAYOUT_WIDE'; // 16:9

  addSlideMaster(pres, theme);

  for (const row of slides) {
    const slide = parseSlideContent(row);
    switch (slide.type) {
      case 'title':         exportTitleSlide(pres, slide.content, theme);         break;
      case 'section':       exportSectionSlide(pres, slide.content, theme);       break;
      case 'agenda':        exportAgendaSlide(pres, slide.content, theme);        break;
      case 'two_column':    exportTwoColumnSlide(pres, slide.content, theme);     break;
      case 'image_caption': exportImageCaptionSlide(pres, slide.content, theme);  break;
      case 'kpi_grid':      exportKpiGridSlide(pres, slide.content, theme);       break;
      case 'quote':         exportQuoteSlide(pres, slide.content, theme);         break;
      case 'closing':       exportClosingSlide(pres, slide.content, theme);       break;
    }
  }

  // PptxGenJS can write to a Node.js Buffer
  const buffer = await pres.write({ outputType: 'nodebuffer' }) as Buffer;
  return buffer;
}
