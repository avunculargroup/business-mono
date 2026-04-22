import type { z } from 'zod';
import type { ImageCaptionContent } from '@/lib/decks/schema';
import type { SlideTheme } from '@/lib/decks/theme';
import { SLIDE_PADDING } from '@/lib/decks/theme';
import { RichTextBlock } from '../primitives/RichTextBlock';
import { ImageFrame } from '../primitives/ImageFrame';

interface Props {
  content: z.infer<typeof ImageCaptionContent>;
  theme: SlideTheme;
  /** Resolved public URL for the image (fetched server-side) */
  imageUrl?: string | null;
}

export function ImageCaptionSlideView({ content, theme, imageUrl }: Props) {
  const px = SLIDE_PADDING.x;
  const py = SLIDE_PADDING.y;
  const isOverlay = content.captionPosition === 'overlay';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: theme.colors.background,
        boxSizing: 'border-box',
        paddingTop: 80,
      }}
    >
      {/* Title bar */}
      {content.title && (
        <div style={{ padding: `${py * 0.6}px ${px}px 0` }}>
          <RichTextBlock
            html={content.title}
            style={{
              fontFamily: theme.fonts.display,
              fontSize: 40,
              fontWeight: 700,
              color: theme.colors.primary,
              maxWidth: 1440,
              width: '100%',
            }}
          />
        </div>
      )}

      {/* Image area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', margin: `${py * 0.4}px ${px}px` }}>
        <ImageFrame
          src={imageUrl ?? null}
          alt={content.caption}
          focalX={content.focalPointX}
          focalY={content.focalPointY}
          style={{ width: '100%', height: '100%', borderRadius: theme.radii.card }}
        />

        {isOverlay && content.caption && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'rgba(0,0,0,0.55)',
              color: '#fff',
              padding: '16px 24px',
              fontSize: 22,
              borderRadius: `0 0 ${theme.radii.card} ${theme.radii.card}`,
            }}
          >
            {content.caption}
          </div>
        )}
      </div>

      {!isOverlay && content.caption && (
        <div
          style={{
            padding: `0 ${px}px ${py * 0.5}px`,
            fontSize: 22,
            color: theme.colors.mutedText,
            fontStyle: 'italic',
            fontFamily: theme.fonts.body,
          }}
        >
          {content.caption}
        </div>
      )}
    </div>
  );
}
