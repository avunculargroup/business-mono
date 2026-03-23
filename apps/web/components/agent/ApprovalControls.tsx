'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { approveActivity } from '@/app/actions/approvals';
import { useToast } from '@/providers/ToastProvider';
import styles from './ApprovalControls.module.css';

interface ApprovalControlsProps {
  activityId: string;
}

export function ApprovalControls({ activityId }: ApprovalControlsProps) {
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);
  const { success, error } = useToast();

  const handleAction = async (action: 'approved' | 'rejected') => {
    setLoading(action === 'approved' ? 'approve' : 'reject');
    const result = await approveActivity(activityId, action, response || undefined);
    setLoading(null);

    if (result.error) {
      error(result.error);
    } else {
      success(action === 'approved' ? 'Approved' : 'Rejected');
    }
  };

  return (
    <div className={styles.controls}>
      <div className={styles.buttons}>
        <Button
          variant="primary"
          size="sm"
          loading={loading === 'approve'}
          onClick={() => handleAction('approved')}
        >
          Approve all
        </Button>
        <Button
          variant="destructive"
          size="sm"
          loading={loading === 'reject'}
          onClick={() => handleAction('rejected')}
        >
          Reject all
        </Button>
      </div>
      <div className={styles.responseRow}>
        <input
          type="text"
          className={styles.responseInput}
          placeholder="Or respond to Simon\u2026"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
        />
      </div>
    </div>
  );
}
