import type PptxGenJS from 'pptxgenjs';
import type { z } from 'zod';
import type { TwoColumnContent } from '../../schema';
import type { SlideTheme } from '../../theme';

export function exportTwoColumnSlide(
  pres: PptxGenJS,
  content: z.infer<typeof TwoColumnContent>,
  theme: SlideTheme,
): void {
  const slide = pres.addSlide();
  const dark = theme.colors.primary.replace('#', '');
  const acc = theme.colors.accent.replace('#', '');
  const txt = theme.colors.text.replace('#', '');
  const muted = theme.colors.mutedText.replace('#', '');
  const border = theme.colors.border.replace('#', '');

  if (content.title) {
    slide.addText(content.title.replace(/<[^>]*>/g, ''), {
      x: 0.6, y: 0.4, w: 9, h: 0.8,
      fontSize: 28, bold: true, color: dark, fontFace: 'Georgia',
    });
  }

  // Left column
  if (content.leftHeading) {
    slide.addText(content.leftHeading.toUpperCase(), {
      x: 0.6, y: 1.4, w: 4.2, h: 0.35,
      fontSize: 13, bold: true, color: acc, charSpacing: 2,
    });
  }
  if (content.leftBody) {
    slide.addText(content.leftBody.replace(/<[^>]*>/g, ''), {
      x: 0.6, y: 1.85, w: 4.2, h: 4,
      fontSize: 17, color: txt, wrap: true, lineSpacingMultiple: 1.3,
    });
  }

  // Divider
  slide.addShape(pres.ShapeType.rect, {
    x: 5.0, y: 1.3, w: 0.02, h: 4.5,
    fill: { color: border },
    line: { color: border },
  });

  // Right column
  if (content.rightHeading) {
    slide.addText(content.rightHeading.toUpperCase(), {
      x: 5.2, y: 1.4, w: 4.2, h: 0.35,
      fontSize: 13, bold: true, color: acc, charSpacing: 2,
    });
  }
  if (content.rightBody) {
    slide.addText(content.rightBody.replace(/<[^>]*>/g, ''), {
      x: 5.2, y: 1.85, w: 4.2, h: 4,
      fontSize: 17, color: txt, wrap: true, lineSpacingMultiple: 1.3,
    });
  }

  void muted;
}
