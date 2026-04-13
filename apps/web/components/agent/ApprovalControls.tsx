'use client';

import { useState, useOptimistic, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/StatusChip';
import { approveActivity } from '@/app/actions/approvals';
import { useToast } from '@/providers/ToastProvider';
import styles from './ApprovalControls.module.css';

interface ApprovalControlsProps {
  activityId: string;
}

export function ApprovalControls({ activityId }: ApprovalControlsProps) {
  const [response, setResponse] = useState('');
  const [isPending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useOptimistic<'pending' | 'approved' | 'rejected'>('pending');
  const { success, error } = useToast();

  const handleAction = (action: 'approved' | 'rejected') => {
    startTransition(async () => {
      setOptimisticStatus(action);
      const result = await approveActivity(activityId, action, response || undefined);
      if (result.error) {
        error(result.error);
      } else {
        success(action === 'approved' ? 'Approved' : 'Rejected');
      }
    });
  };

  if (optimisticStatus !== 'pending') {
    return (
      <div className={styles.controls}>
        <StatusChip
          label={optimisticStatus === 'approved' ? 'Approved' : 'Rejected'}
          color={optimisticStatus === 'approved' ? 'success' : 'destructive'}
        />
      </div>
    );
  }

  return (
    <div className={styles.controls}>
      <div className={styles.buttons}>
        <Button
          variant="primary"
          size="sm"
          loading={isPending}
          onClick={() => handleAction('approved')}
        >
          Approve all
        </Button>
        <Button
          variant="destructive"
          size="sm"
          loading={isPending}
          onClick={() => handleAction('rejected')}
        >
          Reject all
        </Button>
      </div>
      <div className={styles.responseRow}>
        <input
          type="text"
          className={styles.responseInput}
          placeholder="Or respond to Simon…"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
        />
      </div>
    </div>
  );
}
