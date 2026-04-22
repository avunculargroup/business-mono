import type PptxGenJS from 'pptxgenjs';
import type { z } from 'zod';
import type { SectionContent } from '../../schema';
import type { SlideTheme } from '../../theme';

export function exportSectionSlide(
  pres: PptxGenJS,
  content: z.infer<typeof SectionContent>,
  theme: SlideTheme,
): void {
  const slide = pres.addSlide();
  const bg = theme.colors.primary.replace('#', '');
  const acc = theme.colors.accent.replace('#', '');

  slide.background = { color: bg };

  if (content.sectionNumber) {
    slide.addText(content.sectionNumber.toUpperCase(), {
      x: 0.8, y: 1.2, w: 8.5, h: 0.4,
      fontSize: 14,
      bold: true,
      color: acc,
      charSpacing: 3,
    });
  }

  if (content.title) {
    slide.addText(content.title.replace(/<[^>]*>/g, ''), {
      x: 0.8, y: 1.8, w: 8.5, h: 2.5,
      fontSize: 44,
      bold: true,
      color: 'FFFFFF',
      fontFace: 'Georgia',
      wrap: true,
    });
  }

  if (content.subtitle) {
    slide.addText(content.subtitle, {
      x: 0.8, y: 4.5, w: 8.5, h: 0.6,
      fontSize: 22,
      color: 'B0B0B0',
    });
  }
}
