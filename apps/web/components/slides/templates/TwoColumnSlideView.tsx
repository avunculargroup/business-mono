import type { z } from 'zod';
import type { TwoColumnContent } from '@/lib/decks/schema';
import type { SlideTheme } from '@/lib/decks/theme';
import { SLIDE_PADDING } from '@/lib/decks/theme';
import { RichTextBlock } from '../primitives/RichTextBlock';

interface Props {
  content: z.infer<typeof TwoColumnContent>;
  theme: SlideTheme;
}

export function TwoColumnSlideView({ content, theme }: Props) {
  const px = SLIDE_PADDING.x;
  const py = SLIDE_PADDING.y;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: `${py}px ${px}px`,
        paddingTop: '13.33%',
        background: theme.colors.background,
        boxSizing: 'border-box',
      }}
    >
      {content.title ? (
        <RichTextBlock
          html={content.title}
          style={{
            fontFamily: theme.fonts.display,
            fontSize: 44,
            fontWeight: 700,
            color: theme.colors.primary,
            marginBottom: 40,
            maxWidth: 1440,
            width: '100%',
          }}
        />
      ) : (
        <div style={{ fontSize: 44, fontWeight: 700, color: theme.colors.border, marginBottom: 40, maxWidth: 1440 }}>
          Slide Title
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, gap: 48 }}>
        {/* Left column */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            borderRight: `1px solid ${theme.colors.border}`,
            paddingRight: 48,
          }}
        >
          {content.leftHeading && (
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: theme.colors.accent,
                fontFamily: theme.fonts.body,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {content.leftHeading}
            </div>
          )}
          {content.leftBody ? (
            <RichTextBlock
              html={content.leftBody}
              style={{ fontSize: 22, lineHeight: 1.6, color: theme.colors.text, fontFamily: theme.fonts.body }}
            />
          ) : (
            <div style={{ fontSize: 22, color: theme.colors.border }}>Left column content</div>
          )}
        </div>

        {/* Right column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {content.rightHeading && (
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: theme.colors.accent,
                fontFamily: theme.fonts.body,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {content.rightHeading}
            </div>
          )}
          {content.rightBody ? (
            <RichTextBlock
              html={content.rightBody}
              style={{ fontSize: 22, lineHeight: 1.6, color: theme.colors.text, fontFamily: theme.fonts.body }}
            />
          ) : (
            <div style={{ fontSize: 22, color: theme.colors.border }}>Right column content</div>
          )}
        </div>
      </div>
    </div>
  );
}
