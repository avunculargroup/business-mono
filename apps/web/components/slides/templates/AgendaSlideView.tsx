import type { z } from 'zod';
import type { AgendaContent } from '@/lib/decks/schema';
import type { SlideTheme } from '@/lib/decks/theme';
import { Folio } from '../primitives/Folio';
import { Eyebrow } from '../primitives/Eyebrow';

interface Props {
  content: z.infer<typeof AgendaContent>;
  theme: SlideTheme;
  slideIndex?: number;
  slideCount?: number;
  deckLabel?: string;
}

export function AgendaSlideView({ content, theme, slideIndex, slideCount }: Props) {
  const title = content.title
    ? content.title.replace(/\.?\s*$/, '') + '.'
    : 'Agenda.';

  return (
    <div style={{ width: '100%', height: '100%', background: theme.colors.surface, position: 'relative', boxSizing: 'border-box' }}>
      <Folio theme={theme} label="Programme" slideIndex={slideIndex} slideCount={slideCount} />

      {/* Body: 2-col grid */}
      <div style={{
        position: 'absolute',
        left: 80,
        right: 80,
        top: 160,
        display: 'grid',
        gridTemplateColumns: '1fr 2fr',
        gap: 80,
      }}>
        {/* Left column */}
        <div>
          <Eyebrow theme={theme} gold>What we&apos;ll cover</Eyebrow>
          <h2 style={{
            fontFamily: theme.fonts.display,
            fontWeight: 700,
            fontSize: 88,
            lineHeight: 1,
            letterSpacing: '-0.02em',
            color: theme.colors.primary,
            margin: '24px 0 0',
          }}>
            {title}
          </h2>
          <div style={{
            fontFamily: theme.fonts.body,
            fontSize: 18,
            lineHeight: 1.55,
            color: theme.colors.mutedText,
            marginTop: 24,
            maxWidth: 380,
          }}>
            Sixty minutes, structured. We&apos;ll move through each section, with time held back at the end for open discussion.
          </div>
        </div>

        {/* Right column: agenda items */}
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {content.items.map((item, i) => (
            <li
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '64px 1fr auto',
                alignItems: 'baseline',
                gap: 24,
                padding: '22px 0',
                borderTop: i === 0
                  ? `1px solid ${theme.colors.primary}`
                  : `1px solid ${theme.colors.border}`,
              }}
            >
              <span style={{ fontFamily: theme.fonts.mono, fontSize: 16, fontWeight: 500, color: theme.colors.accent }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ fontFamily: theme.fonts.display, fontSize: 28, lineHeight: 1.25, color: theme.colors.primary }}>
                {item.label}
              </span>
              {item.duration && (
                <span style={{ fontFamily: theme.fonts.mono, fontSize: 14, color: theme.colors.mutedText, letterSpacing: '0.06em' }}>
                  {item.duration}
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
