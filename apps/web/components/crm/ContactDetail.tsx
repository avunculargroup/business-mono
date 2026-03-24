'use client';

import { PipelineChip } from '@/components/ui/PipelineChip';
import { StatusChip } from '@/components/ui/StatusChip';
import { InteractionTimeline } from './InteractionTimeline';
import Link from 'next/link';
import styles from './ContactDetail.module.css';

interface ContactDetailProps {
  contact: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    pipeline_stage: string;
    bitcoin_literacy: string;
    notes: string | null;
    companies: { id: string; name: string } | null;
  };
  interactions: Array<{
    id: string;
    type: string;
    direction: string | null;
    summary: string | null;
    occurred_at: string;
    source: string | null;
    team_members: { full_name: string } | null;
  }>;
  openTaskCount: number;
}

export function ContactDetail({ contact, interactions, openTaskCount }: ContactDetailProps) {
  return (
    <div className={styles.layout}>
      <aside className={styles.profile}>
        <div className={styles.section}>
          <PipelineChip stage={contact.pipeline_stage} />
          <StatusChip label={contact.bitcoin_literacy} color="neutral" />
          {openTaskCount > 0 && (
            <StatusChip label={`${openTaskCount} open task${openTaskCount !== 1 ? 's' : ''}`} color="accent" />
          )}
        </div>

        {contact.companies && (
          <div className={styles.section}>
            <span className={styles.label}>Company</span>
            <Link href={`/crm/companies/${contact.companies.id}`} className={styles.link}>
              {contact.companies.name}
            </Link>
          </div>
        )}

        {contact.email && (
          <div className={styles.section}>
            <span className={styles.label}>Email</span>
            <span className={styles.value}>{contact.email}</span>
          </div>
        )}

        {contact.phone && (
          <div className={styles.section}>
            <span className={styles.label}>Phone</span>
            <span className={styles.value}>{contact.phone}</span>
          </div>
        )}

        {contact.notes && (
          <div className={styles.section}>
            <span className={styles.label}>Notes</span>
            <p className={styles.notes}>{contact.notes}</p>
          </div>
        )}
      </aside>

      <div className={styles.timeline}>
        <InteractionTimeline interactions={interactions} contactId={contact.id} />
      </div>
    </div>
  );
}
