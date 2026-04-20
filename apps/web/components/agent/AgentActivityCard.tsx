'use client';

import { AgentBadge } from '@/components/ui/AgentBadge';
import { ApprovalControls } from './ApprovalControls';
import type { Database } from '@/lib/database';
import { formatDateTime } from '@/lib/utils';
import styles from './AgentActivityCard.module.css';

type AgentActivity = Database['public']['Tables']['agent_activity']['Row'];

interface AgentActivityCardProps {
  activity: AgentActivity;
  compact?: boolean;
}

type ParsedAction = {
  prefix: string | null;
  message: string;
};

const AGENT_LABELS: Record<string, string> = {
  pm: 'PM',
  ba: 'BA',
  recorder: 'Recorder',
  archivist: 'Archivist',
  content_creator: 'Content Creator',
};

function parseAction(action: string): ParsedAction {
  // "Signal message from Name: message"
  const signalMatch = action.match(/^Signal message from (.+?):\s*([\s\S]+)$/);
  if (signalMatch) {
    return { prefix: `Signal from ${signalMatch[1]}`, message: signalMatch[2] };
  }

  // "Dispatch to agent: message"
  const dispatchMatch = action.match(/^Dispatch to (\w+):\s*([\s\S]+)$/);
  if (dispatchMatch) {
    const agentKey = dispatchMatch[1];
    const label = AGENT_LABELS[agentKey] ?? agentKey.charAt(0).toUpperCase() + agentKey.slice(1);
    return { prefix: `→ ${label}`, message: dispatchMatch[2] };
  }

  // "Web directive: message"
  const webMatch = action.match(/^Web directive:\s*([\s\S]+)$/i);
  if (webMatch) {
    return { prefix: 'Web directive', message: webMatch[1] };
  }

  return { prefix: null, message: action };
}

const TRIGGER_LABELS: Record<string, string> = {
  call_transcript: 'Call transcript',
  signal_message: 'Signal message',
  scheduled: 'Scheduled',
  agent: 'Agent',
};

export function AgentActivityCard({ activity, compact }: AgentActivityCardProps) {
  const proposedActions = (activity.proposed_actions as Array<{ description: string; entity_type?: string; entity_id?: string }>) || [];
  const { prefix, message } = parseAction(activity.action);
  const approvedResponse = (activity.approved_actions as Array<{ response?: string }> | null)
    ?.find((a) => a.response)?.response ?? null;

  const triggerLabel = activity.trigger_type ? TRIGGER_LABELS[activity.trigger_type] : null;

  const borderClass =
    activity.status === 'pending'
      ? styles.borderWarning
      : activity.status === 'approved'
        ? styles.borderSuccess
        : activity.status === 'rejected'
          ? styles.borderDestructive
          : '';

  return (
    <div className={`${styles.card} ${borderClass} ${compact ? styles.compact : ''}`}>
      <div className={styles.header}>
        <AgentBadge agentName={activity.agent_name} size={compact ? 'sm' : 'md'} />
        <span className={styles.timestamp}>{formatDateTime(activity.created_at)}</span>
      </div>

      {prefix && <p className={styles.actionPrefix}>{prefix}</p>}
      <p className={styles.action}>{message}</p>

      {triggerLabel && (
        <p className={styles.trigger}>Triggered by: {triggerLabel}</p>
      )}

      {proposedActions.length > 0 && !compact && (
        <ul className={styles.actionList}>
          {proposedActions.map((pa, i) => (
            <li key={i} className={styles.actionItem}>
              {pa.description}
              {pa.entity_type && (
                <span className={styles.entity}> ({pa.entity_type})</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {compact && proposedActions.length > 0 && (
        <p className={styles.actionCount}>
          {proposedActions.length} proposed action{proposedActions.length !== 1 ? 's' : ''}
        </p>
      )}

      {activity.entity_type === 'content_items' && activity.entity_id && (
        <a href={`/content/${activity.entity_id}`} className={styles.entityLink}>
          View draft →
        </a>
      )}

      {approvedResponse && !activity.entity_id && !compact && (
        <details className={styles.responsePreview}>
          <summary>View generated content</summary>
          <pre className={styles.responseBody}>{approvedResponse}</pre>
        </details>
      )}

      {activity.status === 'pending' && !compact && (
        <ApprovalControls activityId={activity.id} />
      )}

      {activity.status !== 'pending' && (
        <div className={styles.statusBadge}>
          <span className={`${styles.statusDot} ${styles[activity.status]}`} />
          {activity.status === 'approved' ? 'Approved' : activity.status === 'rejected' ? 'Rejected' : 'Auto'}
        </div>
      )}
    </div>
  );
}
