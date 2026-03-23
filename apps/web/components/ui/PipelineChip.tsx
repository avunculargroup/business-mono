import { StatusChip } from './StatusChip';
import type { PipelineStage } from '@platform/shared';

const stageColors: Record<string, 'neutral' | 'accent' | 'success' | 'warning' | 'destructive'> = {
  lead: 'neutral',
  warm: 'warning',
  active: 'accent',
  client: 'success',
  dormant: 'destructive',
};

const stageLabels: Record<string, string> = {
  lead: 'Lead',
  warm: 'Warm',
  active: 'Active',
  client: 'Client',
  dormant: 'Dormant',
};

interface PipelineChipProps {
  stage: PipelineStage | string;
}

export function PipelineChip({ stage }: PipelineChipProps) {
  return (
    <StatusChip
      label={stageLabels[stage] || stage}
      color={stageColors[stage] || 'neutral'}
    />
  );
}
