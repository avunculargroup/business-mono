import type { z } from 'zod';
import type { AgendaContent } from '@/lib/decks/schema';
import type { SlideTheme } from '@/lib/decks/theme';
import { SLIDE_PADDING } from '@/lib/decks/theme';

interface Props {
  content: z.infer<typeof AgendaContent>;
  theme: SlideTheme;
}

export function AgendaSlideView({ content, theme }: Props) {
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
        paddingTop: 240,
        background: theme.colors.background,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          fontSize: 48,
          fontWeight: 700,
          fontFamily: theme.fonts.display,
          color: theme.colors.primary,
          marginBottom: 48,
          paddingBottom: 24,
          borderBottom: `3px solid ${theme.colors.accent}`,
          maxWidth: 1440,
          width: '100%',
        }}
      >
        {content.title || 'Agenda'}
      </div>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {content.items.map((item, i) => (
          <li
            key={i}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 20,
              fontSize: 28,
              color: theme.colors.text,
              fontFamily: theme.fonts.body,
            }}
          >
            <span
              style={{
                minWidth: 36,
                height: 36,
                borderRadius: '50%',
                background: theme.colors.accentLight,
                color: theme.colors.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {i + 1}
            </span>
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.duration && (
              <span style={{ fontSize: 20, color: theme.colors.mutedText }}>{item.duration}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
