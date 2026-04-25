import type { z } from 'zod';
import type { QuoteContent } from '@/lib/decks/schema';
import type { SlideTheme } from '@/lib/decks/theme';
import { Folio } from '../primitives/Folio';

interface Props {
  content: z.infer<typeof QuoteContent>;
  theme: SlideTheme;
  slideIndex?: number;
  slideCount?: number;
  deckLabel?: string;
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function QuoteSlideView({ content, theme, slideIndex, slideCount, deckLabel }: Props) {
  const initials = content.attribution ? getInitials(content.attribution) : '?';

  return (
    <div style={{ width: '100%', height: '100%', background: theme.colors.surface, position: 'relative', boxSizing: 'border-box' }}>
      <Folio theme={theme} label={deckLabel ?? 'In their words'} slideIndex={slideIndex} slideCount={slideCount} />

      {/* Quote body */}
      <div style={{
        position: 'absolute',
        left: 80,
        right: 80,
        top: 200,
        maxWidth: 1280,
      }}>
        {/* Decorative opening quote glyph */}
        <div style={{
          fontFamily: theme.fonts.display,
          fontWeight: 700,
          fontSize: 200,
          lineHeight: 0.7,
          color: theme.colors.accent,
          userSelect: 'none',
          pointerEvents: 'none',
        }}>
          {'“'}
        </div>

        <p style={{
          fontFamily: theme.fonts.display,
          fontWeight: 400,
          fontSize: 56,
          lineHeight: 1.25,
          letterSpacing: '-0.01em',
          color: theme.colors.primary,
          margin: '24px 0 0',
          maxWidth: 1280,
        }}>
          {content.quote || 'The quote goes here.'}
        </p>
      </div>

      {/* Attribution */}
      {(content.attribution || content.role) && (
        <div style={{
          position: 'absolute',
          left: 80,
          bottom: 96,
          display: 'flex',
          alignItems: 'center',
          gap: 20,
        }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: theme.colors.accentLight,
            color: theme.colors.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: theme.fonts.display,
            fontSize: 22,
            fontWeight: 600,
            flexShrink: 0,
          }}>
            {initials}
          </div>
          <div>
            {content.attribution && (
              <div style={{ fontFamily: theme.fonts.body, fontSize: 20, fontWeight: 600, color: theme.colors.primary }}>
                {content.attribution}
              </div>
            )}
            {content.role && (
              <div style={{ fontFamily: theme.fonts.body, fontSize: 16, color: theme.colors.mutedText, marginTop: 4 }}>
                {content.role}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
