'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CompanyHero } from './CompanyHero';
import { CompanyCategory } from './CompanyCategory';
import { CompanyRecordForm } from './CompanyRecordForm';
import { DomainsSection } from './DomainsSection';
import { SubscriptionsSection } from './SubscriptionsSection';
import { deleteCompanyRecord } from '@/app/actions/company';
import { useToast } from '@/providers/ToastProvider';
import { useRouter } from 'next/navigation';
import { Building2, Plus } from 'lucide-react';
import type { CompanyRecord, CompanyRecordType, CompanyDomain, CompanySubscription } from '@platform/shared';
import styles from './CompanyView.module.css';

const CATEGORY_ORDER = ['Legal', 'Identity', 'Content', 'Documents', 'Custom'];

interface CompanyViewProps {
  records: CompanyRecord[];
  recordTypes: CompanyRecordType[];
  signedUrls: Record<string, string>;
  initialDomains: CompanyDomain[];
  initialSubscriptions: CompanySubscription[];
}

export function CompanyView({ records, recordTypes: initialTypes, signedUrls, initialDomains, initialSubscriptions }: CompanyViewProps) {
  const router = useRouter();
  const { success, error } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editRecord, setEditRecord] = useState<CompanyRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [recordTypes, setRecordTypes] = useState<CompanyRecordType[]>(initialTypes);

  const pinned = records.filter((r) => r.is_pinned);
  const unpinned = records.filter((r) => !r.is_pinned);

  // Group unpinned by category, preserving CATEGORY_ORDER
  const grouped = CATEGORY_ORDER.reduce<Record<string, CompanyRecord[]>>((acc, cat) => {
    const matching = unpinned.filter((r) => r.type?.category === cat);
    if (matching.length > 0) acc[cat] = matching;
    return acc;
  }, {});

  // Also include any categories not in the predefined order
  unpinned.forEach((r) => {
    const cat = r.type?.category ?? 'Custom';
    if (!CATEGORY_ORDER.includes(cat) && !grouped[cat]) {
      grouped[cat] = [];
    }
    if (!CATEGORY_ORDER.includes(cat)) {
      grouped[cat].push(r);
    }
  });

  const handleEdit = (record: CompanyRecord) => {
    setEditRecord(record);
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteCompanyRecord(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    if ('error' in result) {
      error(result.error);
      return;
    }
    success('Record deleted.');
    router.refresh();
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditRecord(null);
  };

  const isEmpty = records.length === 0;

  return (
    <>
      <div className={styles.toolbar}>
        <Button
          variant="primary"
          size="sm"
          onClick={() => { setEditRecord(null); setShowForm(true); }}
        >
          <Plus size={16} strokeWidth={1.5} />
          Add record
        </Button>
      </div>

      {isEmpty ? (
        <EmptyState
          icon={Building2}
          title="No company records yet"
          description="Add legal details, brand assets, mission, and other company reference data."
          actionLabel="Add first record"
          onAction={() => { setEditRecord(null); setShowForm(true); }}
        />
      ) : (
        <>
          {pinned.length > 0 && (
            <CompanyHero
              records={pinned}
              signedUrls={signedUrls}
              onEdit={handleEdit}
              onDelete={(r) => setDeleteTarget(r)}
            />
          )}
          {Object.entries(grouped).map(([cat, catRecords]) => (
            <CompanyCategory
              key={cat}
              label={cat}
              records={catRecords}
              signedUrls={signedUrls}
              onEdit={handleEdit}
              onDelete={(r) => setDeleteTarget(r)}
            />
          ))}
        </>
      )}

      <DomainsSection initialDomains={initialDomains} />
      <SubscriptionsSection initialSubscriptions={initialSubscriptions} />

      <CompanyRecordForm
        open={showForm}
        onClose={handleFormClose}
        recordTypes={recordTypes}
        editRecord={editRecord}
        onTypesChanged={setRecordTypes}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete record"
        description={`Delete this "${deleteTarget?.type?.label ?? deleteTarget?.type_key}" record? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleting}
      />
    </>
  );
}
