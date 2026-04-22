import type { z } from 'zod';
import type { ClosingContent } from '@/lib/decks/schema';
import type { SlideTheme } from '@/lib/decks/theme';
import { SLIDE_PADDING } from '@/lib/decks/theme';
import { RichTextBlock } from '../primitives/RichTextBlock';

interface Props {
  content: z.infer<typeof ClosingContent>;
  theme: SlideTheme;
}

export function ClosingSlideView({ content, theme }: Props) {
  const px = SLIDE_PADDING.x;
  const py = SLIDE_PADDING.y;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: `${py}px ${px}px`,
        background: theme.colors.primary,
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {/* Top accent bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 6,
          background: theme.colors.accent,
        }}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {content.headline ? (
          <RichTextBlock
            html={content.headline}
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
            Thank You
          </div>
        )}

        {content.subheadline && (
          <div style={{ fontSize: 28, color: 'rgba(255,255,255,0.7)', fontFamily: theme.fonts.body, marginBottom: 48 }}>
            {content.subheadline}
          </div>
        )}

        {content.cta && (
          <div
            style={{
              display: 'inline-block',
              fontSize: 24,
              fontWeight: 700,
              color: theme.colors.accent,
              padding: '14px 32px',
              border: `2px solid ${theme.colors.accent}`,
              borderRadius: theme.radii.chip,
              fontFamily: theme.fonts.body,
              alignSelf: 'flex-start',
            }}
          >
            {content.cta}
          </div>
        )}
      </div>

      {(content.contactEmail || content.contactPhone) && (
        <div style={{ display: 'flex', gap: 40 }}>
          {content.contactEmail && (
            <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.6)', fontFamily: theme.fonts.body }}>
              {content.contactEmail}
            </div>
          )}
          {content.contactPhone && (
            <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.6)', fontFamily: theme.fonts.body }}>
              {content.contactPhone}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
