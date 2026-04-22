import type { z } from 'zod';
import type { KpiGridContent } from '@/lib/decks/schema';
import type { SlideTheme } from '@/lib/decks/theme';
import { SLIDE_PADDING } from '@/lib/decks/theme';
import { RichTextBlock } from '../primitives/RichTextBlock';

interface Props {
  content: z.infer<typeof KpiGridContent>;
  theme: SlideTheme;
}

export function KpiGridSlideView({ content, theme }: Props) {
  const px = SLIDE_PADDING.x;
  const py = SLIDE_PADDING.y;
  const cols = content.columns ?? 3;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: `${py}px ${px}px`,
        paddingTop: 120,
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
            marginBottom: 48,
            maxWidth: 1440,
            width: '100%',
          }}
        />
      ) : (
        <div style={{ fontSize: 44, fontWeight: 700, color: theme.colors.border, marginBottom: 48, maxWidth: 1440 }}>
          KPI Overview
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 24,
          flex: 1,
          alignContent: 'start',
        }}
      >
        {content.metrics.map((m, i) => (
          <div
            key={i}
            style={{
              background: theme.colors.surface,
              borderRadius: theme.radii.card,
              padding: '32px 28px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              borderLeft: `4px solid ${theme.colors.accent}`,
            }}
          >
            <div style={{ fontSize: 16, color: theme.colors.mutedText, fontFamily: theme.fonts.body, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {m.label}
            </div>
            <div style={{ fontSize: 52, fontWeight: 700, color: theme.colors.primary, fontFamily: theme.fonts.display, lineHeight: 1 }}>
              {m.value}
            </div>
            {m.change && (
              <div style={{ fontSize: 18, color: m.changePositive ? '#2E7D32' : '#C62828', fontWeight: 600 }}>
                {m.change}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
