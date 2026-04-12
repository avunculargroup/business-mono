'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PipelineChip } from '@/components/ui/PipelineChip';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ContactForm } from './ContactForm';
import { deleteContact } from '@/app/actions/contacts';
import { useOptimisticList } from '@/hooks/useOptimisticList';
import { formatRelativeDate } from '@/lib/utils';
import { Plus, Users, Eye, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/providers/ToastProvider';
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
  teamMembers: { id: string; full_name: string }[];
}

export function ContactsList({ initialContacts, totalCount: _totalCount, companies, teamMembers }: ContactsListProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [editContact, setEditContact] = useState<ContactRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContactRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();
  const { success, error } = useToast();
  const { items: contacts, optimisticAdd } = useOptimisticList(initialContacts);

  const handleContactCreated = useCallback((contact?: ContactRow) => {
    if (contact) {
      optimisticAdd(contact, async () => {});
    }
    setShowCreate(false);
  }, [optimisticAdd]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const result = await deleteContact(deleteTarget.id);
    setIsDeleting(false);
    if (result.error) {
      error(result.error);
    } else {
      success('Contact deleted');
      setDeleteTarget(null);
      router.refresh();
    }
  };

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
        return m?.full_name || '\u2014';
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
        data={contacts}
        onRowClick={(row) => router.push(`/crm/contacts/${row.id}`)}
        rowKey={(row) => row.id}
        rowActions={(row) => [
          {
            label: 'View',
            icon: <Eye size={14} strokeWidth={1.5} />,
            onClick: () => router.push(`/crm/contacts/${row.id}`),
          },
          {
            label: 'Edit',
            icon: <Pencil size={14} strokeWidth={1.5} />,
            onClick: () => setEditContact(row),
          },
          {
            label: 'Delete',
            icon: <Trash2 size={14} strokeWidth={1.5} />,
            onClick: () => setDeleteTarget(row),
            destructive: true,
          },
        ]}
        pagination={{
          page: 1,
          pageSize: 25,
          total: contacts.length,
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

      {/* Create slide-over */}
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
          onSuccess={handleContactCreated}
        />
      </SlideOver>

      {/* Edit slide-over */}
      <SlideOver
        open={!!editContact}
        onClose={() => setEditContact(null)}
        title="Edit contact"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditContact(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form="contact-edit-form">Save changes</Button>
          </>
        }
      >
        {editContact && (
          <ContactForm
            key={editContact.id}
            companies={companies}
            teamMembers={teamMembers}
            mode="edit"
            defaultValues={editContact}
            onSuccess={() => {
              setEditContact(null);
              router.refresh();
            }}
          />
        )}
      </SlideOver>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete contact"
        description={`Permanently delete ${deleteTarget?.first_name} ${deleteTarget?.last_name}? This cannot be undone.`}
        confirmLabel="Delete contact"
        destructive
        loading={isDeleting}
      />
    </div>
  );
}
