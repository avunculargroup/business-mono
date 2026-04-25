import type { SlideTheme } from '@/lib/decks/theme';

interface EyebrowProps {
  theme: SlideTheme;
  children: React.ReactNode;
  gold?: boolean;
}

export function Eyebrow({ theme, children, gold = true }: EyebrowProps) {
  return (
    <div
      style={{
        fontFamily: theme.fonts.mono,
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: gold ? theme.colors.accent : theme.colors.mutedText,
      }}
    >
      {children}
    </div>
  );
}
