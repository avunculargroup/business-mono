import type { SlideTheme } from '@/lib/decks/theme';

interface FolioProps {
  theme: SlideTheme;
  label?: string;
  slideIndex?: number;
  slideCount?: number;
}

export function Folio({ theme, label = '', slideIndex, slideCount }: FolioProps) {
  const n = slideIndex ?? 1;
  const total = slideCount ?? 1;
  const indexStr = String(n).padStart(2, '0');
  const totalStr = String(total).padStart(2, '0');

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 48,
          left: 80,
          right: 80,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: theme.fonts.mono,
          fontSize: 12,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: theme.colors.mutedText,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bts-logo.svg" width={22} height={22} alt="BTS" style={{ display: 'block' }} />
          <span>{label}</span>
        </span>
        <span>
          <span style={{ color: theme.colors.accent }}>{indexStr}</span>
          {' / '}
          {totalStr}
        </span>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 90,
          left: 80,
          right: 80,
          height: 1,
          background: theme.colors.border,
        }}
      />
    </>
  );
}
