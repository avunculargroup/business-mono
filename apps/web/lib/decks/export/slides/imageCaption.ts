import type PptxGenJS from 'pptxgenjs';
import type { z } from 'zod';
import type { ImageCaptionContent } from '../../schema';
import type { SlideTheme } from '../../theme';

export function exportImageCaptionSlide(
  pres: PptxGenJS,
  content: z.infer<typeof ImageCaptionContent>,
  theme: SlideTheme,
  imageDataUrl?: string,
): void {
  const slide = pres.addSlide();
  const dark = theme.colors.primary.replace('#', '');
  const muted = theme.colors.mutedText.replace('#', '');

  let yOffset = 0.4;

  if (content.title) {
    slide.addText(content.title.replace(/<[^>]*>/g, ''), {
      x: 0.6, y: yOffset, w: 9, h: 0.7,
      fontSize: 28, bold: true, color: dark, fontFace: 'Georgia',
    });
    yOffset = 1.3;
  }

  const imgH = content.title ? 4.5 : 5.5;

  if (imageDataUrl) {
    slide.addImage({
      data: imageDataUrl,
      x: 0.6,
      y: yOffset,
      w: 9,
      h: imgH,
      sizing: { type: 'cover', w: 9, h: imgH },
    });
  } else {
    slide.addShape(pres.ShapeType.rect, {
      x: 0.6, y: yOffset, w: 9, h: imgH,
      fill: { color: 'E5E5E5' },
      line: { color: 'E5E5E5' },
    });
  }

  if (content.caption && content.captionPosition !== 'overlay') {
    slide.addText(content.caption, {
      x: 0.6, y: yOffset + imgH + 0.15, w: 9, h: 0.5,
      fontSize: 15, italic: true, color: muted,
    });
  }
}
