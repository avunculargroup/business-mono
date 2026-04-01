'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PipelineChip } from '@/components/ui/PipelineChip';
import { Button } from '@/components/ui/Button';
import { approveContact } from '@/app/actions/fastmail';
import { formatDate } from '@/lib/utils';
import styles from './FastmailReviewList.module.css';

export type ReviewContact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  pipeline_stage: string | null;
  created_at: string;
};

export function FastmailReviewList({ contacts }: { contacts: ReviewContact[] }) {
  const [approvingId, setApprovingId] = useState<string | null>(null);

  async function handleApprove(id: string) {
    setApprovingId(id);
    await approveContact(id);
    setApprovingId(null);
  }

  if (contacts.length === 0) {
    return (
      <p className={styles.empty}>
        No contacts pending review — all email-sourced contacts have been approved.
      </p>
    );
  }

  return (
    <ul className={styles.list}>
      {contacts.map((contact) => {
        const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || '(no name)';
        return (
          <li key={contact.id} className={styles.item}>
            <div className={styles.info}>
              <span className={styles.name}>{name}</span>
              {contact.email && (
                <span className={styles.email}>{contact.email}</span>
              )}
              <span className={styles.meta}>
                {contact.pipeline_stage && (
                  <PipelineChip stage={contact.pipeline_stage} />
                )}
                <span className={styles.date}>Added {formatDate(contact.created_at)}</span>
              </span>
            </div>
            <div className={styles.actions}>
              <Button
                variant="primary"
                size="sm"
                loading={approvingId === contact.id}
                onClick={() => handleApprove(contact.id)}
              >
                Approve as lead
              </Button>
              <Link href={`/crm/contacts/${contact.id}`}>
                <Button variant="secondary" size="sm">View in CRM</Button>
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
