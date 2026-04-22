import type PptxGenJS from 'pptxgenjs';
import type { z } from 'zod';
import type { QuoteContent } from '../../schema';
import type { SlideTheme } from '../../theme';

export function exportQuoteSlide(
  pres: PptxGenJS,
  content: z.infer<typeof QuoteContent>,
  theme: SlideTheme,
): void {
  const slide = pres.addSlide();
  const dark = theme.colors.primary.replace('#', '');
  const acc = theme.colors.accent.replace('#', '');
  const sec = theme.colors.secondary.replace('#', '');
  const muted = theme.colors.mutedText.replace('#', '');
  const light = theme.colors.accentLight.replace('#', '');

  // Decorative quote mark
  slide.addText('“', {
    x: 0.4, y: 0.1, w: 1.5, h: 1.5,
    fontSize: 120, color: light, fontFace: 'Georgia',
  });

  if (content.quote) {
    slide.addText(content.quote.replace(/<[^>]*>/g, ''), {
      x: 0.7, y: 1.0, w: 8.8, h: 3.5,
      fontSize: 28, italic: true, color: dark, fontFace: 'Georgia',
      wrap: true, lineSpacingMultiple: 1.4,
    });
  }

  // Attribution line
  slide.addShape(pres.ShapeType.rect, {
    x: 0.7, y: 4.8, w: 0.55, h: 0.06,
    fill: { color: acc }, line: { color: acc },
  });

  if (content.attribution) {
    slide.addText(content.attribution, {
      x: 1.4, y: 4.7, w: 7, h: 0.4,
      fontSize: 18, bold: true, color: sec,
    });
  }
  if (content.role) {
    slide.addText(content.role, {
      x: 1.4, y: 5.15, w: 7, h: 0.35,
      fontSize: 14, color: muted,
    });
  }
}
