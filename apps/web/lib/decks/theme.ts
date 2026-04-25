// Neutral, presentation-ready theme for external slide decks.
// Intentionally separate from the BTS platform UI palette.

export interface SlideTheme {
  id: string;
  colors: {
    background: string;
    surface: string;
    text: string;
    mutedText: string;
    primary: string;
    secondary: string;
    accent: string;
    border: string;
    accentLight: string;
    negative: string;
  };
  fonts: {
    display: string;
    body: string;
    mono: string;
  };
  radii: {
    card: string;
    chip: string;
  };
}

export const companyTheme: SlideTheme = {
  id: 'company-default',
  colors: {
    background: '#FFFFFF',
    surface: '#FAFAF8',       // tint — used as background on title/agenda/quote/closing slides
    text: '#1A1915',          // ink
    mutedText: '#6B6860',     // muted
    primary: '#1A1915',       // ink
    secondary: '#6B6860',     // muted
    accent: '#9A7A2E',        // gold
    accentLight: '#F0E4C0',   // gold-light
    border: '#E5E1D6',        // line
    negative: '#B04040',      // negative KPI delta
  },
  fonts: {
    display: "'Playfair Display', Georgia, 'Times New Roman', serif",
    body: "'DM Sans', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
  },
  radii: {
    card: '8px',
    chip: '4px',
  },
};

export const THEMES: Record<string, SlideTheme> = {
  'company-default': companyTheme,
};

export function getTheme(themeId: string): SlideTheme {
  return THEMES[themeId] ?? companyTheme;
}

// Virtual canvas dimensions (logical px)
export const SLIDE_WIDTH  = 1600;
export const SLIDE_HEIGHT = 900;

// Spacing scale (used by slide templates; not the platform CSS tokens)
export const SLIDE_PADDING = {
  x: 80,
  y: 64,
} as const;
