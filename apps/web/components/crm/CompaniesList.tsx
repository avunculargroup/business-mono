'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { CompanyForm } from './CompanyForm';
import { Plus, Building2 } from 'lucide-react';
import styles from './ContactsList.module.css';

type CompanyRow = {
  id: string;
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

export function CompaniesList({ initialCompanies, totalCount }: CompaniesListProps) {
  const [showCreate, setShowCreate] = useState(false);
  const router = useRouter();

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
        data={initialCompanies}
        onRowClick={(row) => router.push(`/crm/companies/${row.id}`)}
        rowKey={(row) => row.id}
        pagination={{
          page: 1,
          pageSize: 25,
          total: totalCount,
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

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add company" size="md">
        <CompanyForm onSuccess={() => setShowCreate(false)} />
      </Modal>
    </div>
  );
}
