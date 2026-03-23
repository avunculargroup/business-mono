import {
  Bot,
  Mic,
  Archive,
  ClipboardList,
  Search,
  PenTool,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import styles from './AgentBadge.module.css';

const agentConfig: Record<string, { icon: LucideIcon; label: string }> = {
  simon: { icon: Bot, label: 'Simon' },
  recorder: { icon: Mic, label: 'Recorder' },
  archivist: { icon: Archive, label: 'Archivist' },
  pm: { icon: ClipboardList, label: 'PM' },
  ba: { icon: Search, label: 'BA' },
  content_creator: { icon: PenTool, label: 'Content Creator' },
};

interface AgentBadgeProps {
  agentName: string;
  size?: 'sm' | 'md';
}

export function AgentBadge({ agentName, size = 'md' }: AgentBadgeProps) {
  const config = agentConfig[agentName] || { icon: Bot, label: agentName };
  const Icon = config.icon;
  const iconSize = size === 'sm' ? 14 : 16;

  return (
    <span className={`${styles.badge} ${styles[size]}`}>
      <Icon size={iconSize} strokeWidth={1.5} />
      <span>{config.label}</span>
    </span>
  );
}
