'use client';

import { useState } from 'react';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toggleFastmailAccount, removeFastmailAccount } from '@/app/actions/fastmail';
import { useOptimisticList } from '@/hooks/useOptimisticList';
import { useToast } from '@/providers/ToastProvider';
import { formatDate } from '@/lib/utils';

export type FastmailAccountRow = {
  id: string;
  username: string;
  display_name: string | null;
  is_active: boolean;
  watched_addresses: string[];
  last_error: string | null;
  last_error_at: string | null;
  consecutive_failures: number;
  last_synced_at: string | null;
  created_at: string;
};

export function FastmailAccountsTable({ accounts }: { accounts: FastmailAccountRow[] }) {
  const [pendingRemove, setPendingRemove] = useState<FastmailAccountRow | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const { items: optimisticAccounts, optimisticUpdate, optimisticRemove } = useOptimisticList(accounts);
  const toast = useToast();

  function handleToggle(account: FastmailAccountRow) {
    const newActive = !account.is_active;
    optimisticUpdate(
      account.id,
      { is_active: newActive } as Partial<FastmailAccountRow>,
      () => toggleFastmailAccount(account.id, newActive)
    );
  }

  async function handleRemove() {
    if (!pendingRemove) return;
    setRemovingId(pendingRemove.id);
    optimisticRemove(pendingRemove.id, () => removeFastmailAccount(pendingRemove.id));
    toast.success(`"${pendingRemove.display_name || pendingRemove.username}" removed`);
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
          {row.display_name || '\u2014'}
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
      width: '10%',
      render: () => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
          ••••••••
        </span>
      ),
    },
    {
      key: 'watched',
      header: 'Watched addresses',
      width: '20%',
      render: (row) =>
        row.watched_addresses.length === 0 ? (
          <span style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>All</span>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {row.watched_addresses.map((addr) => (
              <li key={addr} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                {addr}
              </li>
            ))}
          </ul>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '20%',
      render: (row) => {
        const hasAuthFailure = !row.is_active && row.last_error;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <StatusChip
              label={hasAuthFailure ? 'Auth failed' : row.is_active ? 'Active' : 'Paused'}
              color={hasAuthFailure ? 'destructive' : row.is_active ? 'success' : 'neutral'}
            />
            {hasAuthFailure && row.last_error && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                {row.last_error}
              </span>
            )}
            {row.last_synced_at && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                Last synced {formatDate(row.last_synced_at)}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'added',
      header: 'Added',
      width: '5%',
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
        data={optimisticAccounts}
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
