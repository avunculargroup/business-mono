'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusChip } from '@/components/ui/StatusChip';
import { DataTable } from '@/components/ui/DataTable';
import { createDomain, updateDomain, deleteDomain } from '@/app/actions/company';
import { useToast } from '@/providers/ToastProvider';
import type { CompanyDomain } from '@platform/shared';
import styles from './DomainsSection.module.css';

function renewalChip(dateStr: string | null): React.ReactNode {
  if (!dateStr) return null;
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return <StatusChip label="Expired" color="destructive" />;
  if (days <= 30) return <StatusChip label={`${days}d`} color="destructive" />;
  if (days <= 90) return <StatusChip label={`${days}d`} color="warning" />;
  return <StatusChip label={new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} color="neutral" />;
}

interface DomainFormState {
  name: string;
  provider: string;
  renewal_date: string;
  notes: string;
}

const EMPTY_FORM: DomainFormState = { name: '', provider: '', renewal_date: '', notes: '' };

interface DomainsSectionProps {
  initialDomains: CompanyDomain[];
}

export function DomainsSection({ initialDomains }: DomainsSectionProps) {
  const router = useRouter();
  const { success, error } = useToast();

  const [domains] = useState<CompanyDomain[]>(initialDomains);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<CompanyDomain | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyDomain | null>(null);
  const [form, setForm] = useState<DomainFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const openAdd = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (domain: CompanyDomain) => {
    setEditTarget(domain);
    setForm({
      name:         domain.name,
      provider:     domain.provider     ?? '',
      renewal_date: domain.renewal_date ?? '',
      notes:        domain.notes        ?? '',
    });
    setShowForm(true);
  };

  const handleClose = () => {
    setShowForm(false);
    setEditTarget(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { error('Domain name is required.'); return; }
    setSaving(true);
    const params = {
      name:         form.name.trim(),
      provider:     form.provider.trim()     || undefined,
      renewal_date: form.renewal_date        || undefined,
      notes:        form.notes.trim()        || undefined,
    };
    const result = editTarget
      ? await updateDomain(editTarget.id, params)
      : await createDomain(params);
    setSaving(false);
    if ('error' in result) { error(result.error); return; }
    success(editTarget ? 'Domain updated.' : 'Domain added.');
    handleClose();
    router.refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteDomain(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    if ('error' in result) { error(result.error); return; }
    success('Domain deleted.');
    router.refresh();
  };

  const set = (field: keyof DomainFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.heading}>Domains</h2>
        <Button variant="secondary" size="sm" onClick={openAdd}>
          <Plus size={14} strokeWidth={1.5} />
          Add domain
        </Button>
      </div>

      <DataTable
        data={domains}
        rowKey={(d) => d.id}
        emptyState={<span className={styles.secondary}>No domains recorded yet.</span>}
        columns={[
          {
            key: 'name',
            header: 'Domain',
            render: (d) => <span className={styles.domainName}>{d.name}</span>,
          },
          {
            key: 'provider',
            header: 'Provider',
            render: (d) => <span className={styles.secondary}>{d.provider ?? '—'}</span>,
            width: '160px',
          },
          {
            key: 'renewal_date',
            header: 'Renews',
            render: (d) => renewalChip(d.renewal_date) ?? <span className={styles.secondary}>—</span>,
            width: '140px',
          },
        ]}
        rowActions={(d) => [
          {
            label: 'Edit',
            icon: <Pencil size={14} strokeWidth={1.5} />,
            onClick: () => openEdit(d),
          },
          {
            label: 'Delete',
            icon: <Trash2 size={14} strokeWidth={1.5} />,
            onClick: () => setDeleteTarget(d),
            destructive: true,
          },
        ]}
      />

      <SlideOver
        open={showForm}
        onClose={handleClose}
        title={editTarget ? 'Edit domain' : 'Add domain'}
        footer={
          <div className={styles.footer}>
            <Button variant="secondary" size="sm" onClick={handleClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editTarget ? 'Save changes' : 'Add domain'}
            </Button>
          </div>
        }
      >
        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Domain name *</label>
            <input
              className={styles.input}
              type="text"
              placeholder="btcsolutions.com"
              value={form.name}
              onChange={set('name')}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Provider</label>
            <input
              className={styles.input}
              type="text"
              placeholder="Cloudflare"
              value={form.provider}
              onChange={set('provider')}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Renewal date</label>
            <input
              className={styles.input}
              type="date"
              value={form.renewal_date}
              onChange={set('renewal_date')}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Notes</label>
            <textarea
              className={styles.textarea}
              placeholder="Any notes…"
              value={form.notes}
              onChange={set('notes')}
            />
          </div>
        </div>
      </SlideOver>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete domain"
        description={`Remove "${deleteTarget?.name}" from your domain records? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleting}
      />
    </section>
  );
}
