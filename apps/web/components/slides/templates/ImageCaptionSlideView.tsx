import type { z } from 'zod';
import type { ImageCaptionContent } from '@/lib/decks/schema';
import type { SlideTheme } from '@/lib/decks/theme';
import { Folio } from '../primitives/Folio';
import { Eyebrow } from '../primitives/Eyebrow';
import { ImageFrame } from '../primitives/ImageFrame';

interface Props {
  content: z.infer<typeof ImageCaptionContent>;
  theme: SlideTheme;
  imageUrl?: string | null;
  slideIndex?: number;
  slideCount?: number;
  deckLabel?: string;
}

export function ImageCaptionSlideView({ content, theme, imageUrl, slideIndex, slideCount, deckLabel }: Props) {
  const isOverlay = content.captionPosition === 'overlay';

  return (
    <div style={{ width: '100%', height: '100%', background: theme.colors.surface, position: 'relative', boxSizing: 'border-box' }}>
      <Folio theme={theme} label={deckLabel ?? '—'} slideIndex={slideIndex} slideCount={slideCount} />

      {/* Body: 2-col grid */}
      <div style={{
        position: 'absolute',
        left: 80,
        right: 80,
        top: 140,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 56,
      }}>
        {/* Left: text content */}
        <div style={{ paddingTop: 32 }}>
          <Eyebrow theme={theme} gold>Figure 1 — Plate</Eyebrow>
          <h2 style={{
            fontFamily: theme.fonts.display,
            fontWeight: 700,
            fontSize: 56,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            color: theme.colors.primary,
            margin: '20px 0 32px',
          }}>
            {content.title || 'Image Title'}
          </h2>
          <div style={{ width: 48, height: 1, background: theme.colors.accent, marginBottom: 24 }} />
          {content.caption && !isOverlay && (
            <p style={{
              fontFamily: theme.fonts.display,
              fontStyle: 'italic',
              fontSize: 22,
              lineHeight: 1.55,
              color: theme.colors.primary,
              margin: 0,
              maxWidth: 540,
            }}>
              {content.caption}
            </p>
          )}
          <div style={{
            marginTop: 32,
            fontFamily: theme.fonts.mono,
            fontSize: 12,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: theme.colors.mutedText,
          }}>
            Reviewed by Stratford Audit · March 2026
          </div>
        </div>

        {/* Right: image */}
        <div style={{ height: 640, position: 'relative' }}>
          <ImageFrame
            src={imageUrl ?? null}
            alt={content.caption ?? ''}
            focalX={content.focalPointX}
            focalY={content.focalPointY}
            style={{ width: '100%', height: '100%' }}
          />
          {isOverlay && content.caption && (
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: `rgba(250, 250, 248, 0.72)`,
              padding: 32,
            }}>
              <p style={{
                fontFamily: theme.fonts.display,
                fontStyle: 'italic',
                fontSize: 22,
                lineHeight: 1.55,
                color: theme.colors.primary,
                margin: 0,
              }}>
                {content.caption}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
