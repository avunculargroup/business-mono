'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PipelineChip } from '@/components/ui/PipelineChip';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { ContactForm } from './ContactForm';
import { formatRelativeDate } from '@/lib/utils';
import { Plus, Users } from 'lucide-react';
import styles from './ContactsList.module.css';

type ContactRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  pipeline_stage: string;
  owner_id: string | null;
  company_id: string | null;
  created_at: string;
  updated_at: string;
};

interface ContactsListProps {
  initialContacts: ContactRow[];
  totalCount: number;
  companies: { id: string; name: string }[];
  teamMembers: { id: string; name: string }[];
}

export function ContactsList({ initialContacts, totalCount, companies, teamMembers }: ContactsListProps) {
  const [showCreate, setShowCreate] = useState(false);
  const router = useRouter();

  const columns: Column<ContactRow>[] = [
    {
      key: 'name',
      header: 'Name',
      width: '25%',
      sortable: true,
      render: (row) => (
        <span className={styles.name}>
          {row.first_name} {row.last_name}
        </span>
      ),
    },
    {
      key: 'company',
      header: 'Company',
      width: '20%',
      render: (row) => {
        const c = companies.find((co) => co.id === row.company_id);
        return c?.name || '\u2014';
      },
    },
    {
      key: 'pipeline',
      header: 'Pipeline',
      width: '12%',
      render: (row) => <PipelineChip stage={row.pipeline_stage} />,
    },
    {
      key: 'owner',
      header: 'Owner',
      width: '15%',
      render: (row) => {
        const m = teamMembers.find((tm) => tm.id === row.owner_id);
        return m?.name || '\u2014';
      },
    },
    {
      key: 'updated',
      header: 'Last contact',
      width: '15%',
      sortable: true,
      render: (row) => (
        <span className={styles.mono}>{formatRelativeDate(row.updated_at)}</span>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} strokeWidth={1.5} />
          Add contact
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={initialContacts}
        onRowClick={(row) => router.push(`/crm/contacts/${row.id}`)}
        rowKey={(row) => row.id}
        pagination={{
          page: 1,
          pageSize: 25,
          total: totalCount,
          onPageChange: () => {},
        }}
        emptyState={
          <div className={styles.empty}>
            <Users size={48} strokeWidth={1} className={styles.emptyIcon} />
            <h3>No contacts yet</h3>
            <p>Add your first contact to get started.</p>
            <Button variant="primary" onClick={() => setShowCreate(true)}>Add contact</Button>
          </div>
        }
      />

      <SlideOver
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add contact"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="contact-form">Save contact</Button>
          </>
        }
      >
        <ContactForm
          companies={companies}
          teamMembers={teamMembers}
          onSuccess={() => setShowCreate(false)}
        />
      </SlideOver>
    </div>
  );
}
