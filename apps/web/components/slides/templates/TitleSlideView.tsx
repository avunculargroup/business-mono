import type { z } from 'zod';
import type { TitleContent } from '@/lib/decks/schema';
import type { SlideTheme } from '@/lib/decks/theme';
import { SLIDE_PADDING } from '@/lib/decks/theme';
import { RichTextBlock } from '../primitives/RichTextBlock';

interface Props {
  content: z.infer<typeof TitleContent>;
  theme: SlideTheme;
}

export function TitleSlideView({ content, theme }: Props) {
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
        padding: `${py}px ${px}px`,
        background: theme.colors.background,
        boxSizing: 'border-box',
        position: 'relative',
        paddingTop: 240,
      }}
    >
      {/* Accent bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 8,
          height: '100%',
          background: theme.colors.accent,
        }}
      />

      {content.headline ? (
        <RichTextBlock
          html={content.headline}
          style={{
            fontFamily: theme.fonts.display,
            fontSize: 72,
            fontWeight: 700,
            color: theme.colors.primary,
            lineHeight: 1.15,
            marginBottom: 24,
            maxWidth: 1440,
            width: '100%',
          }}
        />
      ) : (
        <div style={{ fontSize: 72, fontWeight: 700, color: theme.colors.border, marginBottom: 24, maxWidth: 1440 }}>
          Presentation Title
        </div>
      )}

      {content.subheadline && (
        <div
          style={{
            fontSize: 32,
            color: theme.colors.mutedText,
            marginBottom: 48,
            fontFamily: theme.fonts.body,
            maxWidth: 1440,
            width: '100%',
          }}
        >
          {content.subheadline}
        </div>
      )}

      <div style={{ display: 'flex', gap: 32, alignItems: 'center', marginTop: 'auto' }}>
        {content.presenter && (
          <div style={{ fontSize: 20, color: theme.colors.secondary }}>{content.presenter}</div>
        )}
        {content.presenter && content.date && (
          <div style={{ width: 1, height: 20, background: theme.colors.border }} />
        )}
        {content.date && (
          <div style={{ fontSize: 20, color: theme.colors.mutedText }}>{content.date}</div>
        )}
      </div>
    </div>
  );
}
