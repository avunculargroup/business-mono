import type { z } from 'zod';
import type { SectionContent } from '@/lib/decks/schema';
import type { SlideTheme } from '@/lib/decks/theme';
import { Folio } from '../primitives/Folio';

interface Props {
  content: z.infer<typeof SectionContent>;
  theme: SlideTheme;
  slideIndex?: number;
  slideCount?: number;
  deckLabel?: string;
}

export function SectionSlideView({ content, theme, slideIndex, slideCount }: Props) {
  const title = content.title
    ? content.title.replace(/\.?\s*$/, '') + '.'
    : 'Section.';

  const folioLabel = [content.sectionNumber, content.title]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 60);

  return (
    <div style={{ width: '100%', height: '100%', background: '#FFFFFF', position: 'relative', boxSizing: 'border-box' }}>
      <Folio theme={theme} label={folioLabel} slideIndex={slideIndex} slideCount={slideCount} />

      {/* Body block */}
      <div style={{
        position: 'absolute',
        left: 80,
        right: 80,
        top: 280,
        display: 'flex',
        gap: 80,
        alignItems: 'flex-start',
      }}>
        {/* Left: section number + gold rule */}
        <div style={{ flexShrink: 0, paddingTop: 18 }}>
          <div style={{
            fontFamily: theme.fonts.mono,
            fontSize: 13,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: theme.colors.accent,
            marginBottom: 12,
          }}>
            {content.sectionNumber || 'PART 01'}
          </div>
          <div style={{ width: 64, height: 1, background: theme.colors.accent }} />
        </div>

        {/* Right: title + subtitle */}
        <div style={{ maxWidth: 1100 }}>
          <h2 style={{
            fontFamily: theme.fonts.display,
            fontWeight: 700,
            fontSize: 144,
            lineHeight: 0.95,
            letterSpacing: '-0.025em',
            color: theme.colors.primary,
            margin: 0,
          }}>
            {title}
          </h2>
          {content.subtitle && (
            <div style={{
              fontFamily: theme.fonts.display,
              fontStyle: 'italic',
              fontSize: 32,
              lineHeight: 1.35,
              color: theme.colors.mutedText,
              marginTop: 32,
              maxWidth: 900,
            }}>
              {content.subtitle}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
