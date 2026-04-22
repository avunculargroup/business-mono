import type PptxGenJS from 'pptxgenjs';
import type { z } from 'zod';
import type { ClosingContent } from '../../schema';
import type { SlideTheme } from '../../theme';

export function exportClosingSlide(
  pres: PptxGenJS,
  content: z.infer<typeof ClosingContent>,
  theme: SlideTheme,
): void {
  const slide = pres.addSlide();
  const bg = theme.colors.primary.replace('#', '');
  const acc = theme.colors.accent.replace('#', '');

  slide.background = { color: bg };

  // Accent bar at top
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: 0.07,
    fill: { color: acc }, line: { color: acc },
  });

  if (content.headline) {
    slide.addText(content.headline.replace(/<[^>]*>/g, ''), {
      x: 0.8, y: 1.2, w: 8.5, h: 2.2,
      fontSize: 44, bold: true, color: 'FFFFFF', fontFace: 'Georgia', wrap: true,
    });
  }

  if (content.subheadline) {
    slide.addText(content.subheadline, {
      x: 0.8, y: 3.6, w: 8.5, h: 0.6,
      fontSize: 22, color: 'B0B0B0',
    });
  }

  if (content.cta) {
    slide.addText(content.cta, {
      x: 0.8, y: 4.4, w: 4, h: 0.55,
      fontSize: 18, bold: true, color: acc,
    });
  }

  const contactParts = [content.contactEmail, content.contactPhone].filter(Boolean).join('   ·   ');
  if (contactParts) {
    slide.addText(contactParts, {
      x: 0.8, y: 5.7, w: 8.5, h: 0.4,
      fontSize: 14, color: '888888',
    });
  }
}
