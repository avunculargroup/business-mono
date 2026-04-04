'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { FastmailAccountsTable, type FastmailAccountRow } from '@/components/settings/FastmailAccountsTable';
import { FastmailExclusionsTable, type FastmailExclusionRow } from '@/components/settings/FastmailExclusionsTable';
import { FastmailAccountForm } from '@/components/settings/FastmailAccountForm';
import { FastmailExclusionForm } from '@/components/settings/FastmailExclusionForm';
import { FastmailReviewList, type ReviewContact } from '@/components/settings/FastmailReviewList';
import type { AgentActivity } from './types';
import { AgentActivityCard } from '@/components/agent/AgentActivityCard';
import styles from './fastmail.module.css';

interface Props {
  accounts: FastmailAccountRow[];
  exclusions: FastmailExclusionRow[];
  reviewContacts: ReviewContact[];
  recentActivity: AgentActivity[];
}

export function FastmailSettingsClient({
  accounts,
  exclusions,
  reviewContacts,
  recentActivity,
}: Props) {
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showExclusionForm, setShowExclusionForm] = useState(false);

  return (
    <div className={styles.container}>

      {/* Accounts */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Connected accounts</h2>
            <p className={styles.sectionDesc}>
              Each active account is polled every 5 minutes. Changes take effect within the next cycle.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowAccountForm(true)}>
            Add account
          </Button>
        </div>
        <FastmailAccountsTable accounts={accounts} />
      </section>

      {/* Exclusions */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Exclusions</h2>
            <p className={styles.sectionDesc}>
              Emails involving any matching domain or address are silently skipped.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setShowExclusionForm(true)}>
            Add exclusion
          </Button>
        </div>
        <FastmailExclusionsTable exclusions={exclusions} />
      </section>

      {/* Review queue */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>
              Needs review
              {reviewContacts.length > 0 && (
                <span className={styles.badge}>{reviewContacts.length}</span>
              )}
            </h2>
            <p className={styles.sectionDesc}>
              Contacts auto-created from email. Approve genuine leads or remove false positives.
            </p>
          </div>
        </div>
        <FastmailReviewList contacts={reviewContacts} />
      </section>

      {/* Recent activity */}
      {recentActivity.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Recent email analysis</h2>
              <p className={styles.sectionDesc}>
                Latest Della analyses from Fastmail emails.
              </p>
            </div>
          </div>
          <div className={styles.activityList}>
            {recentActivity.map((activity) => (
              <AgentActivityCard key={activity.id} activity={activity} compact />
            ))}
          </div>
        </section>
      )}

      {/* Modals */}
      <Modal
        open={showAccountForm}
        onClose={() => setShowAccountForm(false)}
        title="Add Fastmail account"
        size="md"
      >
        <FastmailAccountForm onSuccess={() => setShowAccountForm(false)} />
      </Modal>

      <Modal
        open={showExclusionForm}
        onClose={() => setShowExclusionForm(false)}
        title="Add exclusion"
        size="md"
      >
        <FastmailExclusionForm onSuccess={() => setShowExclusionForm(false)} />
      </Modal>
    </div>
  );
}
