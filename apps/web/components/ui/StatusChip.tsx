import styles from './StatusChip.module.css';
import { cn } from '@/lib/utils';

type ChipColor = 'neutral' | 'accent' | 'success' | 'warning' | 'destructive';

interface StatusChipProps {
  label: string;
  color?: ChipColor;
  className?: string;
}

export function StatusChip({ label, color = 'neutral', className }: StatusChipProps) {
  return (
    <span className={cn(styles.chip, styles[color], className)}>
      {label}
    </span>
  );
}
