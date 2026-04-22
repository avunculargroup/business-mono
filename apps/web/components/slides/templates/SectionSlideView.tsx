import type { z } from 'zod';
import type { SectionContent } from '@/lib/decks/schema';
import type { SlideTheme } from '@/lib/decks/theme';
import { SLIDE_PADDING } from '@/lib/decks/theme';
import { RichTextBlock } from '../primitives/RichTextBlock';

interface Props {
  content: z.infer<typeof SectionContent>;
  theme: SlideTheme;
}

export function SectionSlideView({ content, theme }: Props) {
  const px = SLIDE_PADDING.x;
  const py = SLIDE_PADDING.y;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: `${py}px ${px}px`,
        background: theme.colors.primary,
        boxSizing: 'border-box',
      }}
    >
      {content.sectionNumber && (
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: theme.colors.accent,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: 24,
            fontFamily: theme.fonts.body,
          }}
        >
          {content.sectionNumber}
        </div>
      )}

      {content.title ? (
        <RichTextBlock
          html={content.title}
          style={{
            fontFamily: theme.fonts.display,
            fontSize: 64,
            fontWeight: 700,
            color: '#FFFFFF',
            lineHeight: 1.2,
            marginBottom: 24,
          }}
        />
      ) : (
        <div style={{ fontSize: 64, fontWeight: 700, color: 'rgba(255,255,255,0.3)', marginBottom: 24 }}>
          Section Title
        </div>
      )}

      {content.subtitle && (
        <div style={{ fontSize: 28, color: 'rgba(255,255,255,0.7)', fontFamily: theme.fonts.body }}>
          {content.subtitle}
        </div>
      )}
    </div>
  );
}
