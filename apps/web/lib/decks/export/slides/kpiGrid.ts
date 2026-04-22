import type PptxGenJS from 'pptxgenjs';
import type { z } from 'zod';
import type { KpiGridContent } from '../../schema';
import type { SlideTheme } from '../../theme';

export function exportKpiGridSlide(
  pres: PptxGenJS,
  content: z.infer<typeof KpiGridContent>,
  theme: SlideTheme,
): void {
  const slide = pres.addSlide();
  const dark = theme.colors.primary.replace('#', '');
  const acc = theme.colors.accent.replace('#', '');
  const surf = theme.colors.surface.replace('#', '');
  const muted = theme.colors.mutedText.replace('#', '');

  if (content.title) {
    slide.addText(content.title.replace(/<[^>]*>/g, ''), {
      x: 0.6, y: 0.4, w: 9, h: 0.7,
      fontSize: 28, bold: true, color: dark, fontFace: 'Georgia',
    });
  }

  const cols = content.columns ?? 3;
  const cardW = (9.8 - (cols - 1) * 0.3) / cols;
  const cardH = 2.5;
  const startX = 0.6;
  const startY = 1.4;

  content.metrics.forEach((m, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (cardW + 0.3);
    const y = startY + row * (cardH + 0.3);

    slide.addShape(pres.ShapeType.rect, {
      x, y, w: cardW, h: cardH,
      fill: { color: surf },
      line: { color: 'E0E0E0', pt: 1 },
    });
    // Left accent bar
    slide.addShape(pres.ShapeType.rect, {
      x, y, w: 0.05, h: cardH,
      fill: { color: acc },
      line: { color: acc },
    });

    slide.addText(m.label.toUpperCase(), {
      x: x + 0.15, y: y + 0.2, w: cardW - 0.2, h: 0.3,
      fontSize: 11, color: muted, charSpacing: 1,
    });
    slide.addText(m.value, {
      x: x + 0.15, y: y + 0.6, w: cardW - 0.2, h: 0.9,
      fontSize: 36, bold: true, color: dark, fontFace: 'Georgia',
    });
    if (m.change) {
      const changeColor = m.changePositive ? '2E7D32' : 'C62828';
      slide.addText(m.change, {
        x: x + 0.15, y: y + 1.6, w: cardW - 0.2, h: 0.4,
        fontSize: 15, bold: true, color: changeColor,
      });
    }
  });
}
