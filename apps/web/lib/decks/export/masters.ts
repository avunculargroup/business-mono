import type PptxGenJS from 'pptxgenjs';
import type { SlideTheme } from '../theme';

export function addSlideMaster(pres: PptxGenJS, theme: SlideTheme): void {
  pres.defineSlideMaster({
    title: 'COMPANY_DEFAULT',
    background: { color: theme.colors.background.replace('#', '') },
  });
}
