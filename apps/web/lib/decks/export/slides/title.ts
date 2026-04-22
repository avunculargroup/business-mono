import type PptxGenJS from 'pptxgenjs';
import type { z } from 'zod';
import type { TitleContent } from '../../schema';
import type { SlideTheme } from '../../theme';

export function exportTitleSlide(
  pres: PptxGenJS,
  content: z.infer<typeof TitleContent>,
  theme: SlideTheme,
): void {
  const slide = pres.addSlide();
  const acc = theme.colors.accent.replace('#', '');
  const dark = theme.colors.primary.replace('#', '');
  const muted = theme.colors.mutedText.replace('#', '');

  // Accent bar on left
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 0.08, h: '100%',
    fill: { color: acc },
    line: { color: acc },
  });

  if (content.headline) {
    slide.addText(content.headline.replace(/<[^>]*>/g, ''), {
      x: 0.8, y: 1.5, w: 8.5, h: 2.2,
      fontSize: 40,
      bold: true,
      color: dark,
      fontFace: 'Georgia',
      wrap: true,
    });
  }

  if (content.subheadline) {
    slide.addText(content.subheadline, {
      x: 0.8, y: 3.9, w: 8.5, h: 0.7,
      fontSize: 22,
      color: muted,
      fontFace: 'Calibri',
    });
  }

  const metaY = 5.8;
  if (content.presenter) {
    slide.addText(content.presenter, { x: 0.8, y: metaY, w: 4, h: 0.4, fontSize: 16, color: dark });
  }
  if (content.date) {
    slide.addText(content.date, { x: 5, y: metaY, w: 4.3, h: 0.4, fontSize: 16, color: muted, align: 'right' });
  }
}
