import type PptxGenJS from 'pptxgenjs';
import type { z } from 'zod';
import type { AgendaContent } from '../../schema';
import type { SlideTheme } from '../../theme';

export function exportAgendaSlide(
  pres: PptxGenJS,
  content: z.infer<typeof AgendaContent>,
  theme: SlideTheme,
): void {
  const slide = pres.addSlide();
  const dark = theme.colors.primary.replace('#', '');
  const acc = theme.colors.accent.replace('#', '');
  const txt = theme.colors.text.replace('#', '');

  slide.addText(content.title || 'Agenda', {
    x: 0.6, y: 0.4, w: 9, h: 0.8,
    fontSize: 32,
    bold: true,
    color: dark,
    fontFace: 'Georgia',
  });

  // Underline as shape
  slide.addShape(pres.ShapeType.rect, {
    x: 0.6, y: 1.3, w: 9, h: 0.04,
    fill: { color: acc },
    line: { color: acc },
  });

  content.items.forEach((item, i) => {
    const y = 1.6 + i * 0.65;
    slide.addText(`${i + 1}.  ${item.label}`, {
      x: 0.6, y, w: 8, h: 0.55,
      fontSize: 20,
      color: txt,
    });
    if (item.duration) {
      slide.addText(item.duration, {
        x: 8.8, y, w: 1, h: 0.55,
        fontSize: 16,
        color: '888888',
        align: 'right',
      });
    }
  });
}
