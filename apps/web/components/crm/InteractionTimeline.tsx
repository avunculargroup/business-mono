'use client';

import { useState } from 'react';
import {
  Phone,
  Mail,
  Video,
  MessageSquare,
  Linkedin,
  StickyNote,
  MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { InteractionForm } from './InteractionForm';
import { StatusChip } from '@/components/ui/StatusChip';
import { formatDateTime } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import styles from './InteractionTimeline.module.css';

const typeIcons: Record<string, LucideIcon> = {
  call: Phone,
  email: Mail,
  meeting: Video,
  zoom: Video,
  signal: MessageSquare,
  linkedin: Linkedin,
  note: StickyNote,
  other: MoreHorizontal,
};

interface InteractionTimelineProps {
  interactions: Array<{
    id: string;
    type: string;
    direction: string | null;
    summary: string | null;
    occurred_at: string;
    source: string | null;
    team_members: { name: string } | null;
  }>;
  contactId: string;
}

export function InteractionTimeline({ interactions, contactId }: InteractionTimelineProps) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <div className={styles.header}>
        <h2 className={styles.title}>Activity</h2>
        <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
          Log interaction
        </Button>
      </div>

      {interactions.length === 0 ? (
        <p className={styles.empty}>No interactions recorded yet.</p>
      ) : (
        <div className={styles.timeline}>
          {interactions.map((interaction) => {
            const Icon = typeIcons[interaction.type] || MoreHorizontal;
            return (
              <div key={interaction.id} className={styles.item}>
                <div className={styles.iconCol}>
                  <div className={styles.icon}>
                    <Icon size={16} strokeWidth={1.5} />
                  </div>
                  <div className={styles.line} />
                </div>
                <div className={styles.content}>
                  <div className={styles.meta}>
                    <span className={styles.type}>{interaction.type}</span>
                    {interaction.direction && (
                      <StatusChip label={interaction.direction} color="neutral" />
                    )}
                    {interaction.source && interaction.source !== 'manual' && (
                      <StatusChip label={interaction.source} color="accent" />
                    )}
                    <span className={styles.timestamp}>
                      {formatDateTime(interaction.occurred_at)}
                    </span>
                  </div>
                  {interaction.summary && (
                    <p className={styles.summary}>{interaction.summary}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Log interaction"
        size="md"
      >
        <InteractionForm contactId={contactId} onSuccess={() => setShowForm(false)} />
      </Modal>
    </div>
  );
}
