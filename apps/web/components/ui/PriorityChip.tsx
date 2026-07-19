import { StatusChip } from './StatusChip';
import { TASK_PRIORITY_LABELS, type TaskPriority } from '@platform/shared';

// Colours stay here — the chip components are the single visual source of truth.
// Labels come from @platform/shared alongside the other enum label maps.
const priorityColors: Record<string, 'neutral' | 'accent' | 'success' | 'warning' | 'destructive'> = {
  low: 'neutral',
  medium: 'neutral',
  high: 'warning',
  urgent: 'destructive',
};

interface PriorityChipProps {
  priority: TaskPriority | string;
}

export function PriorityChip({ priority }: PriorityChipProps) {
  return (
    <StatusChip
      label={TASK_PRIORITY_LABELS[priority as TaskPriority] || priority}
      color={priorityColors[priority] || 'neutral'}
    />
  );
}
