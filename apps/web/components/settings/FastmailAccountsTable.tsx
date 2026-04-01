'use client';

import { useState } from 'react';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toggleFastmailAccount, removeFastmailAccount } from '@/app/actions/fastmail';
import { formatDate } from '@/lib/utils';

export type FastmailAccountRow = {
  id: string;
  username: string;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
};

export function FastmailAccountsTable({ accounts }: { accounts: FastmailAccountRow[] }) {
  const [pendingToggle, setPendingToggle] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<FastmailAccountRow | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleToggle(account: FastmailAccountRow) {
    setPendingToggle(account.id);
    await toggleFastmailAccount(account.id, !account.is_active);
    setPendingToggle(null);
  }

  async function handleRemove() {
    if (!pendingRemove) return;
    setRemovingId(pendingRemove.id);
    await removeFastmailAccount(pendingRemove.id);
    setRemovingId(null);
    setPendingRemove(null);
  }

  const columns: Column<FastmailAccountRow>[] = [
    {
      key: 'name',
      header: 'Name',
      width: '20%',
      render: (row) => (
        <span style={{ fontWeight: 500 }}>
          {row.display_name || '—'}
        </span>
      ),
    },
    {
      key: 'username',
      header: 'Username',
      width: '30%',
      render: (row) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
          {row.username}
        </span>
      ),
    },
    {
      key: 'token',
      header: 'Token',
      width: '15%',
      render: () => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
          ••••••••
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '15%',
      render: (row) => (
        <StatusChip
          label={row.is_active ? 'Active' : 'Paused'}
          color={row.is_active ? 'success' : 'neutral'}
        />
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
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <Button
            variant="secondary"
            size="sm"
            loading={pendingToggle === row.id}
            onClick={() => handleToggle(row)}
          >
            {row.is_active ? 'Pause' : 'Activate'}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setPendingRemove(row)}
          >
            Remove
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={accounts}
        rowKey={(row) => row.id}
        emptyState={
          <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)', padding: 'var(--space-4) 0' }}>
            No accounts connected. Add a Fastmail account to start syncing emails.
          </p>
        }
      />

      <ConfirmDialog
        open={!!pendingRemove}
        onClose={() => setPendingRemove(null)}
        onConfirm={handleRemove}
        title="Remove Fastmail account"
        description={`Remove ${pendingRemove?.display_name || pendingRemove?.username}? Existing interactions and contacts will not be deleted, but this account will no longer be polled.`}
        confirmLabel="Remove account"
        loading={removingId === pendingRemove?.id}
      />
    </>
  );
}
