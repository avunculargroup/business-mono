import type { z } from 'zod';
import type { KpiGridContent } from '@/lib/decks/schema';
import type { SlideTheme } from '@/lib/decks/theme';
import { Folio } from '../primitives/Folio';
import { Eyebrow } from '../primitives/Eyebrow';

interface Props {
  content: z.infer<typeof KpiGridContent>;
  theme: SlideTheme;
  slideIndex?: number;
  slideCount?: number;
  deckLabel?: string;
}

export function KpiGridSlideView({ content, theme, slideIndex, slideCount, deckLabel }: Props) {
  const cols = content.columns ?? 3;

  return (
    <div style={{ width: '100%', height: '100%', background: '#FFFFFF', position: 'relative', boxSizing: 'border-box' }}>
      <Folio theme={theme} label={deckLabel ?? 'Quarter at a glance'} slideIndex={slideIndex} slideCount={slideCount} />

      {/* Title area */}
      <div style={{ position: 'absolute', left: 80, right: 80, top: 140 }}>
        <Eyebrow theme={theme} gold>Quarter at a glance</Eyebrow>
        <h2 style={{
          fontFamily: theme.fonts.display,
          fontWeight: 700,
          fontSize: 64,
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          color: theme.colors.primary,
          margin: '20px 0 0',
        }}>
          {content.title || 'Performance Overview'}
        </h2>
      </div>

      {/* KPI grid */}
      <div style={{
        position: 'absolute',
        left: 80,
        right: 80,
        top: 340,
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 0,
        borderTop: `1px solid ${theme.colors.primary}`,
        borderBottom: `1px solid ${theme.colors.border}`,
      }}>
        {content.metrics.map((m, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const totalRows = Math.ceil(content.metrics.length / cols);
          return (
            <div
              key={i}
              style={{
                padding: '36px 32px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                borderRight: col < cols - 1 ? `1px solid ${theme.colors.border}` : 'none',
                borderBottom: row < totalRows - 1 ? `1px solid ${theme.colors.border}` : 'none',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{
                  fontFamily: theme.fonts.mono,
                  fontSize: 12,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: theme.colors.mutedText,
                }}>
                  {m.label}
                </span>
                <span style={{ fontFamily: theme.fonts.mono, fontSize: 11, color: theme.colors.accent }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <div style={{
                fontFamily: theme.fonts.display,
                fontWeight: 600,
                fontSize: 72,
                lineHeight: 1,
                letterSpacing: '-0.02em',
                color: theme.colors.primary,
              }}>
                {m.value}
              </div>
              {m.change && (
                <div style={{ fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.mutedText, marginTop: 4 }}>
                  <span style={{ color: m.changePositive ? theme.colors.accent : theme.colors.negative, fontWeight: 600 }}>
                    {m.change}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
