import { AgentActivityCard } from '@/components/agent/AgentActivityCard';
import type { Database } from '@/lib/database';

type AgentActivity = Database['public']['Tables']['agent_activity']['Row'];

interface ApprovalCardProps {
  activity: AgentActivity;
}

export function ApprovalCard({ activity }: ApprovalCardProps) {
  return <AgentActivityCard activity={activity} />;
}
