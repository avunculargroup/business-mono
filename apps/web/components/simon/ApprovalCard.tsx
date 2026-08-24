import { AgentActivityCard } from '@/components/agent/AgentActivityCard';
import type { AgentActivityItem } from '@platform/data';

interface ApprovalCardProps {
  activity: AgentActivityItem;
}

export function ApprovalCard({ activity }: ApprovalCardProps) {
  return <AgentActivityCard activity={activity} />;
}
