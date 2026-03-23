import { StatusChip } from './StatusChip';
import type { TaskPriority } from '@platform/shared';

const priorityColors: Record<string, 'neutral' | 'accent' | 'success' | 'warning' | 'destructive'> = {
  low: 'neutral',
  medium: 'neutral',
  high: 'warning',
  urgent: 'destructive',
};

const priorityLabels: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

interface PriorityChipProps {
  priority: TaskPriority | string;
}

export function PriorityChip({ priority }: PriorityChipProps) {
  return (
    <StatusChip
      label={priorityLabels[priority] || priority}
      color={priorityColors[priority] || 'neutral'}
    />
  );
}
