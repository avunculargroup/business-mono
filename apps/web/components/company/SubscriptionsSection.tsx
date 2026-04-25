'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusChip } from '@/components/ui/StatusChip';
import { DataTable } from '@/components/ui/DataTable';
import { createSubscription, updateSubscription, deleteSubscription } from '@/app/actions/company';
import { useToast } from '@/providers/ToastProvider';
import type { CompanySubscription, SubscriptionPaymentType } from '@platform/shared';
import styles from './SubscriptionsSection.module.css';

const PAYMENT_CHIP: Record<SubscriptionPaymentType, { label: string; color: 'neutral' | 'accent' | 'success' | 'warning' }> = {
  free:  { label: 'Free',  color: 'success' },
  paid:  { label: 'Paid',  color: 'accent' },
  trial: { label: 'Trial', color: 'warning' },
};

function expiryChip(dateStr: string | null): React.ReactNode {
  if (!dateStr) return null;
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return <StatusChip label="Expired" color="destructive" />;
  if (days <= 30) return <StatusChip label={`${days}d`} color="destructive" />;
  if (days <= 90) return <StatusChip label={`${days}d`} color="warning" />;
  return <StatusChip label={new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} color="neutral" />;
}

interface SubFormState {
  business: string;
  website: string;
  service_type: string;
  payment_type: SubscriptionPaymentType | '';
  expiry: string;
  account_email: string;
  notes: string;
}

const EMPTY_FORM: SubFormState = {
  business: '', website: '', service_type: '', payment_type: '',
  expiry: '', account_email: '', notes: '',
};

interface SubscriptionsSectionProps {
  initialSubscriptions: CompanySubscription[];
}

export function SubscriptionsSection({ initialSubscriptions }: SubscriptionsSectionProps) {
  const router = useRouter();
  const { success, error } = useToast();

  const [subscriptions] = useState<CompanySubscription[]>(initialSubscriptions);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<CompanySubscription | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanySubscription | null>(null);
  const [form, setForm] = useState<SubFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const openAdd = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (sub: CompanySubscription) => {
    setEditTarget(sub);
    setForm({
      business:      sub.business,
      website:       sub.website       ?? '',
      service_type:  sub.service_type  ?? '',
      payment_type:  sub.payment_type  ?? '',
      expiry:        sub.expiry        ?? '',
      account_email: sub.account_email ?? '',
      notes:         sub.notes         ?? '',
    });
    setShowForm(true);
  };

  const handleClose = () => {
    setShowForm(false);
    setEditTarget(null);
  };

  const handleSave = async () => {
    if (!form.business.trim()) { error('Business name is required.'); return; }
    setSaving(true);
    const params = {
      business:      form.business.trim(),
      website:       form.website.trim()       || undefined,
      service_type:  form.service_type.trim()  || undefined,
      payment_type:  (form.payment_type as SubscriptionPaymentType) || undefined,
      expiry:        form.expiry               || undefined,
      account_email: form.account_email.trim() || undefined,
      notes:         form.notes.trim()         || undefined,
    };
    const result = editTarget
      ? await updateSubscription(editTarget.id, params)
      : await createSubscription(params);
    setSaving(false);
    if ('error' in result) { error(result.error); return; }
    success(editTarget ? 'Subscription updated.' : 'Subscription added.');
    handleClose();
    router.refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteSubscription(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    if ('error' in result) { error(result.error); return; }
    success('Subscription deleted.');
    router.refresh();
  };

  const setField =
    (field: keyof SubFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.heading}>Subscriptions &amp; Accounts</h2>
        <Button variant="secondary" size="sm" onClick={openAdd}>
          <Plus size={14} strokeWidth={1.5} />
          Add subscription
        </Button>
      </div>

      <DataTable
        data={subscriptions}
        rowKey={(s) => s.id}
        emptyState={<span className={styles.secondary}>No subscriptions recorded yet.</span>}
        columns={[
          {
            key: 'business',
            header: 'Service',
            render: (s) => (
              <div>
                <div className={styles.businessName}>{s.business}</div>
                {s.service_type && <div className={styles.secondary}>{s.service_type}</div>}
              </div>
            ),
          },
          {
            key: 'account_email',
            header: 'Account email',
            render: (s) => <span className={styles.secondary}>{s.account_email ?? '—'}</span>,
            width: '220px',
          },
          {
            key: 'payment_type',
            header: 'Plan',
            render: (s) => {
              if (!s.payment_type) return <span className={styles.secondary}>—</span>;
              const chip = PAYMENT_CHIP[s.payment_type];
              return <StatusChip label={chip.label} color={chip.color} />;
            },
            width: '80px',
          },
          {
            key: 'expiry',
            header: 'Expires',
            render: (s) => expiryChip(s.expiry) ?? <span className={styles.secondary}>—</span>,
            width: '140px',
          },
        ]}
        rowActions={(s) => [
          {
            label: 'Edit',
            icon: <Pencil size={14} strokeWidth={1.5} />,
            onClick: () => openEdit(s),
          },
          {
            label: 'Delete',
            icon: <Trash2 size={14} strokeWidth={1.5} />,
            onClick: () => setDeleteTarget(s),
            destructive: true,
          },
        ]}
      />

      <SlideOver
        open={showForm}
        onClose={handleClose}
        title={editTarget ? 'Edit subscription' : 'Add subscription'}
        footer={
          <div className={styles.footer}>
            <Button variant="secondary" size="sm" onClick={handleClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editTarget ? 'Save changes' : 'Add subscription'}
            </Button>
          </div>
        }
      >
        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Business *</label>
            <input
              className={styles.input}
              type="text"
              placeholder="Mailjet"
              value={form.business}
              onChange={setField('business')}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Website</label>
            <input
              className={styles.input}
              type="url"
              placeholder="https://mailjet.com"
              value={form.website}
              onChange={setField('website')}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Service type</label>
            <input
              className={styles.input}
              type="text"
              placeholder="Email delivery"
              value={form.service_type}
              onChange={setField('service_type')}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Plan</label>
            <select
              className={styles.select}
              value={form.payment_type}
              onChange={setField('payment_type')}
            >
              <option value="">— select —</option>
              <option value="free">Free</option>
              <option value="paid">Paid</option>
              <option value="trial">Trial</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Expiry</label>
            <input
              className={styles.input}
              type="date"
              value={form.expiry}
              onChange={setField('expiry')}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Account email</label>
            <input
              className={styles.input}
              type="email"
              placeholder="simon@btcsolutions.com"
              value={form.account_email}
              onChange={setField('account_email')}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Notes</label>
            <textarea
              className={styles.textarea}
              placeholder="Any notes…"
              value={form.notes}
              onChange={setField('notes')}
            />
          </div>
        </div>
      </SlideOver>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete subscription"
        description={`Remove "${deleteTarget?.business}" from your subscriptions? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleting}
      />
    </section>
  );
}
