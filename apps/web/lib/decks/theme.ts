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
  };
  fonts: {
    display: string;
    body: string;
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
    surface: '#F7F7F7',
    text: '#111111',
    mutedText: '#555555',
    primary: '#1A1A1A',
    secondary: '#444444',
    accent: '#C9A84C',      // BTS gold as accent highlight only
    accentLight: '#F5EDD4',
    border: '#E0E0E0',
  },
  fonts: {
    display: "'Georgia', 'Times New Roman', serif",
    body: "'Inter', 'Helvetica Neue', sans-serif",
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
