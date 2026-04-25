import type { z } from 'zod';
import type { TwoColumnContent } from '@/lib/decks/schema';
import type { SlideTheme } from '@/lib/decks/theme';
import { Folio } from '../primitives/Folio';
import { Eyebrow } from '../primitives/Eyebrow';

interface Props {
  content: z.infer<typeof TwoColumnContent>;
  theme: SlideTheme;
  slideIndex?: number;
  slideCount?: number;
  deckLabel?: string;
}

export function TwoColumnSlideView({ content, theme, slideIndex, slideCount, deckLabel }: Props) {
  return (
    <div style={{ width: '100%', height: '100%', background: '#FFFFFF', position: 'relative', boxSizing: 'border-box' }}>
      <Folio theme={theme} label={deckLabel ?? '—'} slideIndex={slideIndex} slideCount={slideCount} />

      {/* Title area */}
      <div style={{ position: 'absolute', left: 80, right: 80, top: 140 }}>
        <Eyebrow theme={theme} gold>The argument</Eyebrow>
        <h2 style={{
          fontFamily: theme.fonts.display,
          fontWeight: 700,
          fontSize: 64,
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          color: theme.colors.primary,
          margin: '20px 0 0',
          maxWidth: 1100,
        }}>
          {content.title || 'Two Columns'}
        </h2>
      </div>

      {/* Two-column body */}
      <div style={{
        position: 'absolute',
        left: 80,
        right: 80,
        top: 380,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 0,
      }}>
        {/* Left: conventional view */}
        <div style={{ padding: '0 56px 0 0', borderRight: `1px solid ${theme.colors.border}` }}>
          <div style={{
            fontFamily: theme.fonts.mono,
            fontSize: 12,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: theme.colors.mutedText,
            marginBottom: 14,
          }}>
            — the conventional view
          </div>
          <h3 style={{
            fontFamily: theme.fonts.display,
            fontWeight: 600,
            fontSize: 32,
            fontStyle: 'italic',
            lineHeight: 1.2,
            color: theme.colors.primary,
            margin: '0 0 20px',
          }}>
            {content.leftHeading || 'Conventional approach'}
          </h3>
          <p style={{
            fontFamily: theme.fonts.body,
            fontSize: 22,
            lineHeight: 1.55,
            color: theme.colors.mutedText,
            margin: 0,
            maxWidth: 620,
          }}>
            {content.leftBody || ''}
          </p>
        </div>

        {/* Right: our position */}
        <div style={{ padding: '0 0 0 56px' }}>
          <div style={{
            fontFamily: theme.fonts.mono,
            fontSize: 12,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: theme.colors.accent,
            marginBottom: 14,
          }}>
            — our position
          </div>
          <h3 style={{
            fontFamily: theme.fonts.display,
            fontWeight: 600,
            fontSize: 32,
            fontStyle: 'normal',
            lineHeight: 1.2,
            color: theme.colors.primary,
            margin: '0 0 20px',
          }}>
            {content.rightHeading || 'Our approach'}
          </h3>
          <p style={{
            fontFamily: theme.fonts.body,
            fontSize: 22,
            lineHeight: 1.55,
            color: theme.colors.primary,
            margin: 0,
            maxWidth: 620,
          }}>
            {content.rightBody || ''}
          </p>
        </div>
      </div>
    </div>
  );
}
