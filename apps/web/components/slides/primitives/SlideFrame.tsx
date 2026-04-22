import type { SlideTheme } from '@/lib/decks/theme';
import { SLIDE_WIDTH, SLIDE_HEIGHT } from '@/lib/decks/theme';
import styles from './SlideFrame.module.css';

interface SlideFrameProps {
  theme: SlideTheme;
  children: React.ReactNode;
  /** Scale factor applied via CSS transform (default 1) */
  scale?: number;
}

export function SlideFrame({ theme, children, scale = 1 }: SlideFrameProps) {
  return (
    <div
      className={styles.frame}
      style={{
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: 'top left',
        backgroundColor: theme.colors.background,
        fontFamily: theme.fonts.body,
        color: theme.colors.text,
      }}
    >
      {children}
    </div>
  );
}
