import type { z } from 'zod';
import type { TitleContent } from '@/lib/decks/schema';
import type { SlideTheme } from '@/lib/decks/theme';
import { Folio } from '../primitives/Folio';
import { Eyebrow } from '../primitives/Eyebrow';

interface Props {
  content: z.infer<typeof TitleContent>;
  theme: SlideTheme;
  slideIndex?: number;
  slideCount?: number;
  deckLabel?: string;
}

export function TitleSlideView({ content, theme, slideIndex, slideCount, deckLabel }: Props) {
  const headline = content.headline
    ? content.headline.replace(/\.?\s*$/, '') + '.'
    : 'Presentation Title.';

  return (
    <div style={{ width: '100%', height: '100%', background: theme.colors.surface, position: 'relative', boxSizing: 'border-box' }}>
      <Folio theme={theme} label={deckLabel ?? 'BTS · Strategy Review'} slideIndex={slideIndex} slideCount={slideCount} />

      {/* Body block */}
      <div style={{
        position: 'absolute',
        left: 80,
        right: 80,
        top: 220,
        display: 'flex',
        flexDirection: 'column',
        gap: 36,
      }}>
        <Eyebrow theme={theme} gold>The Quarterly Review</Eyebrow>
        <h1 style={{
          fontFamily: theme.fonts.display,
          fontWeight: 700,
          fontSize: 116,
          lineHeight: 1.02,
          letterSpacing: '-0.02em',
          color: theme.colors.primary,
          margin: 0,
          maxWidth: 1280,
        }}>
          {headline}
        </h1>
        {content.subheadline && (
          <div style={{
            fontFamily: theme.fonts.display,
            fontStyle: 'italic',
            fontSize: 32,
            lineHeight: 1.35,
            color: theme.colors.mutedText,
            maxWidth: 1100,
          }}>
            {content.subheadline}
          </div>
        )}
      </div>

      {/* Bottom footer */}
      <div style={{
        position: 'absolute',
        left: 80,
        right: 80,
        bottom: 64,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
      }}>
        <div style={{ display: 'flex', gap: 56 }}>
          {content.presenter && (
            <div>
              <div style={{ fontFamily: theme.fonts.mono, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: theme.colors.mutedText, marginBottom: 6 }}>
                Presented by
              </div>
              <div style={{ fontFamily: theme.fonts.body, fontSize: 20, fontWeight: 500, color: theme.colors.primary }}>
                {content.presenter}
              </div>
            </div>
          )}
          {content.date && (
            <div>
              <div style={{ fontFamily: theme.fonts.mono, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: theme.colors.mutedText, marginBottom: 6 }}>
                Date
              </div>
              <div style={{ fontFamily: theme.fonts.body, fontSize: 20, fontWeight: 500, color: theme.colors.primary }}>
                {content.date}
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bts-logo.svg" width={44} height={44} alt="BTS" style={{ display: 'block' }} />
          <div style={{ fontFamily: theme.fonts.display, fontSize: 22, fontWeight: 600, color: theme.colors.primary, letterSpacing: '0.04em' }}>
            Bitcoin Treasury Solutions
          </div>
        </div>
      </div>
    </div>
  );
}
