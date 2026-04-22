import type { z } from 'zod';
import type { QuoteContent } from '@/lib/decks/schema';
import type { SlideTheme } from '@/lib/decks/theme';
import { SLIDE_PADDING } from '@/lib/decks/theme';
import { RichTextBlock } from '../primitives/RichTextBlock';

interface Props {
  content: z.infer<typeof QuoteContent>;
  theme: SlideTheme;
}

export function QuoteSlideView({ content, theme }: Props) {
  const px = SLIDE_PADDING.x;
  const py = SLIDE_PADDING.y;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        padding: `${py}px ${px + 40}px`,
        paddingTop: 160,
        background: theme.colors.background,
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {/* Large decorative quote mark */}
      <div
        style={{
          position: 'absolute',
          top: py,
          left: px - 10,
          fontSize: 200,
          lineHeight: 1,
          color: theme.colors.accentLight,
          fontFamily: theme.fonts.display,
          fontWeight: 700,
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        "
      </div>

      {content.quote ? (
        <RichTextBlock
          html={content.quote}
          style={{
            fontFamily: theme.fonts.display,
            fontSize: 44,
            fontWeight: 400,
            color: theme.colors.primary,
            lineHeight: 1.45,
            fontStyle: 'italic',
            position: 'relative',
            zIndex: 1,
            marginBottom: 40,
            maxWidth: 1440,
            width: '100%',
          }}
        />
      ) : (
        <div style={{ fontSize: 44, color: theme.colors.border, marginBottom: 40, fontStyle: 'italic', maxWidth: 1440 }}>
          "The quote goes here..."
        </div>
      )}

      {(content.attribution || content.role) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 3, background: theme.colors.accent }} />
          <div>
            {content.attribution && (
              <div style={{ fontSize: 22, fontWeight: 700, color: theme.colors.secondary, fontFamily: theme.fonts.body }}>
                {content.attribution}
              </div>
            )}
            {content.role && (
              <div style={{ fontSize: 18, color: theme.colors.mutedText, fontFamily: theme.fonts.body }}>
                {content.role}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
