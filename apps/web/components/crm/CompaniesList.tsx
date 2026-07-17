'use client';

import { useRouter } from 'next/navigation';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CompanyForm } from './CompanyForm';
import { deleteCompany } from '@/app/actions/companies';
import { useEntityList } from '@/hooks/useEntityList';
import { Plus, Building2, Eye, Pencil, Trash2 } from 'lucide-react';
import styles from './ContactsList.module.css';

type CompanyRow = {
  id: string;
  slug: string;
  name: string;
  industry: string | null;
  size: string | null;
  website: string | null;
  created_at: string;
};

interface CompaniesListProps {
  initialCompanies: CompanyRow[];
  totalCount: number;
}

export function CompaniesList({ initialCompanies, totalCount: _totalCount }: CompaniesListProps) {
  const router = useRouter();
  const {
    items: companies,
    showCreate,
    setShowCreate,
    editing: editCompany,
    setEditing: setEditCompany,
    deleteTarget,
    setDeleteTarget,
    isDeleting,
    isSubmitting,
    setIsSubmitting,
    handleCreated,
    confirmDelete,
  } = useEntityList<CompanyRow>({
    initialItems: initialCompanies,
    entityLabel: 'Company',
    remove: deleteCompany,
  });

  const columns: Column<CompanyRow>[] = [
    {
      key: 'name',
      header: 'Company',
      width: '30%',
      sortable: true,
      render: (row) => <span className={styles.name}>{row.name}</span>,
    },
    {
      key: 'industry',
      header: 'Industry',
      width: '20%',
      render: (row) => row.industry || '\u2014',
    },
    {
      key: 'size',
      header: 'Size',
      width: '15%',
      render: (row) => row.size || '\u2014',
    },
    {
      key: 'website',
      header: 'Website',
      width: '25%',
      render: (row) =>
        row.website ? (
          <a href={row.website} target="_blank" rel="noopener noreferrer" className={styles.mono}>
            {row.website.replace(/^https?:\/\//, '')}
          </a>
        ) : '\u2014',
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} strokeWidth={1.5} />
          Add company
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={companies}
        onRowClick={(row) => router.push(`/crm/companies/${row.slug}`)}
        rowKey={(row) => row.id}
        rowActions={(row) => [
          {
            label: 'View',
            icon: <Eye size={14} strokeWidth={1.5} />,
            onClick: () => router.push(`/crm/companies/${row.slug}`),
          },
          {
            label: 'Edit',
            icon: <Pencil size={14} strokeWidth={1.5} />,
            onClick: () => setEditCompany(row),
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
          total: companies.length,
          onPageChange: () => {},
        }}
        emptyState={
          <div className={styles.empty}>
            <Building2 size={48} strokeWidth={1} className={styles.emptyIcon} />
            <h3>No companies yet</h3>
            <p>Add your first company to get started.</p>
            <Button variant="primary" onClick={() => setShowCreate(true)}>Add company</Button>
          </div>
        }
      />

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add company" size="md">
        <CompanyForm onSuccess={handleCreated} />
      </Modal>

      {/* Edit modal */}
      <Modal
        open={!!editCompany}
        onClose={() => setEditCompany(null)}
        title="Edit company"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditCompany(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form="company-edit-form" loading={isSubmitting}>Save changes</Button>
          </>
        }
      >
        {editCompany && (
          <CompanyForm
            key={editCompany.id}
            mode="edit"
            defaultValues={editCompany}
            onSuccess={() => {
              setEditCompany(null);
              router.refresh();
            }}
            onPendingChange={setIsSubmitting}
          />
        )}
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete company"
        description={`Permanently delete ${deleteTarget?.name}? This cannot be undone.`}
        confirmLabel="Delete company"
        destructive
        loading={isDeleting}
      />
    </div>
  );
}
