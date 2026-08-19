import { StatusChip } from './StatusChip';
import { PIPELINE_STAGE_LABELS, type PipelineStage } from '@platform/shared';

// Colours stay here — the chip components are the single visual source of truth.
// Labels come from @platform/shared alongside the other enum label maps.
const stageColors: Record<string, 'neutral' | 'accent' | 'success' | 'warning' | 'destructive'> = {
  lead: 'neutral',
  warm: 'warning',
  active: 'accent',
  client: 'success',
  dormant: 'destructive',
};

interface PipelineChipProps {
  stage: PipelineStage | string;
}

export function PipelineChip({ stage }: PipelineChipProps) {
  return (
    <StatusChip
      label={PIPELINE_STAGE_LABELS[stage as PipelineStage] || stage}
      color={stageColors[stage] || 'neutral'}
    />
  );
}
