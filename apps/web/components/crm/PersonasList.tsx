'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PersonaForm } from './PersonaForm';
import { deletePersona } from '@/app/actions/personas';
import { useOptimisticList } from '@/hooks/useOptimisticList';
import {
  PERSONA_MARKET_SEGMENT_LABELS,
  PERSONA_SOPHISTICATION_LABELS,
  type Persona,
  type PersonaMarketSegment,
  type PersonaSophisticationLevel,
} from '@platform/shared';
import { Plus, UserSquare2, Eye, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/providers/ToastProvider';
import styles from './PersonasList.module.css';

interface PersonasListProps {
  initialPersonas: Persona[];
  totalCount: number;
}

export function PersonasList({ initialPersonas, totalCount: _totalCount }: PersonasListProps) {
  const [showCreate, setShowCreate]     = useState(false);
  const [editPersona, setEditPersona]   = useState<Persona | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Persona | null>(null);
  const [isDeleting, setIsDeleting]     = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const { success, error } = useToast();
  const { items: personas, optimisticAdd } = useOptimisticList(initialPersonas);

  const handleCreated = useCallback((persona?: Persona) => {
    if (persona) optimisticAdd(persona, async () => {});
    setShowCreate(false);
  }, [optimisticAdd]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const result = await deletePersona(deleteTarget.id);
    setIsDeleting(false);
    if (result.error) {
      error(result.error);
    } else {
      success('Persona deleted');
      setDeleteTarget(null);
      router.refresh();
    }
  };

  const columns: Column<Persona>[] = [
    {
      key: 'name',
      header: 'Name',
      width: '30%',
      sortable: true,
      render: (row) => <span className={styles.name}>{row.name}</span>,
    },
    {
      key: 'market_segment',
      header: 'Segment',
      width: '20%',
      render: (row) => (
        <StatusChip
          label={PERSONA_MARKET_SEGMENT_LABELS[row.market_segment as PersonaMarketSegment] ?? row.market_segment}
          color="neutral"
        />
      ),
    },
    {
      key: 'sophistication_level',
      header: 'Sophistication',
      width: '15%',
      render: (row) => (
        <StatusChip
          label={PERSONA_SOPHISTICATION_LABELS[row.sophistication_level as PersonaSophisticationLevel] ?? row.sophistication_level}
          color="neutral"
        />
      ),
    },
    {
      key: 'estimated_aum',
      header: 'Est. AUM',
      width: '20%',
      render: (row) => <span className={styles.aum}>{row.estimated_aum ?? '—'}</span>,
    },
    {
      key: 'objections',
      header: 'Objections',
      width: '15%',
      render: (row) => (
        <span className={styles.aum}>{row.objection_bank?.length ?? 0}</span>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} strokeWidth={1.5} />
          Add persona
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={personas}
        onRowClick={(row) => router.push(`/crm/personas/${row.id}`)}
        rowKey={(row) => row.id}
        rowActions={(row) => [
          {
            label: 'View',
            icon: <Eye size={14} strokeWidth={1.5} />,
            onClick: () => router.push(`/crm/personas/${row.id}`),
          },
          {
            label: 'Edit',
            icon: <Pencil size={14} strokeWidth={1.5} />,
            onClick: () => setEditPersona(row),
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
          total: personas.length,
          onPageChange: () => {},
        }}
        emptyState={
          <div className={styles.empty}>
            <UserSquare2 size={48} strokeWidth={1} className={styles.emptyIcon} />
            <h3>No personas yet</h3>
            <p>Define your ideal client archetypes to help Della match contacts and guide outreach.</p>
            <Button variant="primary" onClick={() => setShowCreate(true)}>Add persona</Button>
          </div>
        }
      />

      <SlideOver
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add persona"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="persona-form" loading={isSubmitting}>Save persona</Button>
          </>
        }
      >
        <PersonaForm
          onSuccess={handleCreated}
          onPendingChange={setIsSubmitting}
        />
      </SlideOver>

      <SlideOver
        open={!!editPersona}
        onClose={() => setEditPersona(null)}
        title="Edit persona"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditPersona(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form="persona-edit-form" loading={isSubmitting}>Save changes</Button>
          </>
        }
      >
        {editPersona && (
          <PersonaForm
            key={editPersona.id}
            mode="edit"
            defaultValues={editPersona}
            onSuccess={() => {
              setEditPersona(null);
              router.refresh();
            }}
            onPendingChange={setIsSubmitting}
          />
        )}
      </SlideOver>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete persona"
        description={`Permanently delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete persona"
        destructive
        loading={isDeleting}
      />
    </div>
  );
}
