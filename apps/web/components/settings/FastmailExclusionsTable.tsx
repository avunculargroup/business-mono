'use client';

import { useState } from 'react';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { removeFastmailExclusion } from '@/app/actions/fastmail';
import { formatDate } from '@/lib/utils';

export type FastmailExclusionRow = {
  id: string;
  type: string;
  value: string;
  notes: string | null;
  created_at: string;
};

export function FastmailExclusionsTable({ exclusions }: { exclusions: FastmailExclusionRow[] }) {
  const [pendingRemove, setPendingRemove] = useState<FastmailExclusionRow | null>(null);
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    if (!pendingRemove) return;
    setRemoving(true);
    await removeFastmailExclusion(pendingRemove.id);
    setRemoving(false);
    setPendingRemove(null);
  }

  const columns: Column<FastmailExclusionRow>[] = [
    {
      key: 'type',
      header: 'Type',
      width: '12%',
      render: (row) => (
        <StatusChip
          label={row.type === 'domain' ? 'Domain' : 'Email'}
          color={row.type === 'domain' ? 'accent' : 'neutral'}
        />
      ),
    },
    {
      key: 'value',
      header: 'Value',
      width: '30%',
      render: (row) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
          {row.value}
        </span>
      ),
    },
    {
      key: 'notes',
      header: 'Notes',
      width: '38%',
      render: (row) => (
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
          {row.notes || '—'}
        </span>
      ),
    },
    {
      key: 'added',
      header: 'Added',
      width: '10%',
      render: (row) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
          {formatDate(row.created_at)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '10%',
      align: 'right',
      render: (row) => (
        <Button variant="destructive" size="sm" onClick={() => setPendingRemove(row)}>
          Remove
        </Button>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={exclusions}
        rowKey={(row) => row.id}
        emptyState={
          <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)', padding: 'var(--space-4) 0' }}>
            No exclusions configured. Emails from all addresses will be processed.
          </p>
        }
      />

      <ConfirmDialog
        open={!!pendingRemove}
        onClose={() => setPendingRemove(null)}
        onConfirm={handleRemove}
        title="Remove exclusion"
        description={`Remove exclusion for "${pendingRemove?.value}"? Emails from this ${pendingRemove?.type} will be processed again from the next sync cycle.`}
        confirmLabel="Remove"
        loading={removing}
      />
    </>
  );
}
