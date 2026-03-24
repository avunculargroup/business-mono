import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusChip } from '@/components/ui/StatusChip';
import { formatDate } from '@/lib/utils';

type TeamMemberRow = {
  id: string;
  full_name: string;
  email: string;
  role: string | null;
  signal_number: string | null;
  created_at: string;
};

export default async function TeamSettingsPage() {
  const supabase = await createClient();

  const { data: members } = await supabase
    .from('team_members')
    .select('*')
    .order('full_name');

  const columns: Column<TeamMemberRow>[] = [
    {
      key: 'name',
      header: 'Name',
      width: '25%',
      render: (row) => <span style={{ fontWeight: 500 }}>{row.full_name}</span>,
    },
    {
      key: 'email',
      header: 'Email',
      width: '25%',
      render: (row) => row.email,
    },
    {
      key: 'role',
      header: 'Role',
      width: '15%',
      render: (row) => row.role ? <StatusChip label={row.role} color="accent" /> : '\u2014',
    },
    {
      key: 'signal',
      header: 'Signal',
      width: '20%',
      render: (row) => row.signal_number ? (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
          {row.signal_number.replace(/(.{3}).*(.{4})/, '$1****$2')}
        </span>
      ) : '\u2014',
    },
    {
      key: 'joined',
      header: 'Joined',
      width: '15%',
      render: (row) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
          {formatDate(row.created_at)}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Team Members" />
      <div style={{ padding: 'var(--space-6)', maxWidth: 'var(--content-max-width)' }}>
        <DataTable
          columns={columns}
          data={(members || []) as TeamMemberRow[]}
          rowKey={(row) => row.id}
        />
      </div>
    </>
  );
}
