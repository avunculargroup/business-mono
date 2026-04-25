import type { z } from 'zod';
import type { ClosingContent } from '@/lib/decks/schema';
import type { SlideTheme } from '@/lib/decks/theme';
import { Folio } from '../primitives/Folio';
import { Eyebrow } from '../primitives/Eyebrow';

interface Props {
  content: z.infer<typeof ClosingContent>;
  theme: SlideTheme;
  slideIndex?: number;
  slideCount?: number;
  deckLabel?: string;
}

export function ClosingSlideView({ content, theme, slideIndex, slideCount }: Props) {
  return (
    <div style={{ width: '100%', height: '100%', background: '#FFFFFF', position: 'relative', boxSizing: 'border-box' }}>
      <Folio theme={theme} label="Thank you" slideIndex={slideIndex} slideCount={slideCount} />

      {/* Body */}
      <div style={{ position: 'absolute', left: 80, right: 80, top: 220 }}>
        <Eyebrow theme={theme} gold>Next steps</Eyebrow>
        <h2 style={{
          fontFamily: theme.fonts.display,
          fontWeight: 700,
          fontSize: 96,
          lineHeight: 1.02,
          letterSpacing: '-0.02em',
          color: theme.colors.primary,
          margin: '24px 0 0',
          maxWidth: 1280,
        }}>
          {content.headline || 'Thank You'}
        </h2>
        {content.subheadline && (
          <p style={{
            fontFamily: theme.fonts.display,
            fontStyle: 'italic',
            fontSize: 28,
            lineHeight: 1.4,
            color: theme.colors.mutedText,
            marginTop: 28,
            maxWidth: 1080,
          }}>
            {content.subheadline}
          </p>
        )}
        {content.cta && (
          <div style={{
            display: 'inline-block',
            marginTop: 40,
            fontFamily: theme.fonts.body,
            fontSize: 18,
            fontWeight: 600,
            color: theme.colors.primary,
            padding: '14px 24px',
            background: theme.colors.accentLight,
            border: `1px solid ${theme.colors.accent}`,
            letterSpacing: '0.02em',
          }}>
            {content.cta} →
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        position: 'absolute',
        left: 80,
        right: 80,
        bottom: 64,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        borderTop: `1px solid ${theme.colors.border}`,
        paddingTop: 24,
      }}>
        <div style={{ display: 'flex', gap: 56 }}>
          {content.contactEmail && (
            <div>
              <div style={{ fontFamily: theme.fonts.mono, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: theme.colors.mutedText, marginBottom: 6 }}>
                Email
              </div>
              <div style={{ fontFamily: theme.fonts.body, fontSize: 18, color: theme.colors.primary }}>
                {content.contactEmail}
              </div>
            </div>
          )}
          {content.contactPhone && (
            <div>
              <div style={{ fontFamily: theme.fonts.mono, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: theme.colors.mutedText, marginBottom: 6 }}>
                Phone
              </div>
              <div style={{ fontFamily: theme.fonts.body, fontSize: 18, color: theme.colors.primary }}>
                {content.contactPhone}
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bts-logo.svg" width={32} height={32} alt="BTS" style={{ display: 'block' }} />
          <div style={{ fontFamily: theme.fonts.display, fontSize: 20, fontWeight: 600, color: theme.colors.primary, letterSpacing: '0.04em' }}>
            BTS
          </div>
        </div>
      </div>
    </div>
  );
}
