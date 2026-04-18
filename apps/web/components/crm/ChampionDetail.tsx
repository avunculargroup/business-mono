'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ChampionForm } from './ChampionForm';
import { ChampionEventLog } from './ChampionEventLog';
import { deleteChampion } from '@/app/actions/champions';
import { useToast } from '@/providers/ToastProvider';
import {
  CHAMPION_STATUS_LABELS,
  CHAMPION_ROLE_TYPE_LABELS,
  type ChampionStatus,
  type ChampionRoleType,
} from '@platform/shared';
import { formatRelativeDate } from '@/lib/utils';
import { Pencil, Trash2 } from 'lucide-react';
import styles from './Champions.module.css';

type ContactInfo = { id: string; first_name: string; last_name: string; job_title: string | null; email: string | null; pipeline_stage: string | null };
type CompanyInfo = { id: string; name: string } | null;
type EventRow    = { id: string; champion_id: string; event_type: string; event_date: string; details: string | null; created_at: string };

export type ChampionDetailData = {
  id: string;
  contact_id: string;
  company_id: string | null;
  role_type: string;
  champion_score: number;
  status: string;
  last_contacted_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  contacts: ContactInfo;
  companies: CompanyInfo;
};

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'destructive'> = {
  active:   'success',
  at_risk:  'warning',
  departed: 'destructive',
};

interface ChampionDetailProps {
  champion: ChampionDetailData;
  events: EventRow[];
  contacts: { id: string; first_name: string; last_name: string; company_id?: string | null }[];
  companies: { id: string; name: string }[];
}

export function ChampionDetail({ champion, events, contacts, companies }: ChampionDetailProps) {
  const [showEdit,     setShowEdit]     = useState(false);
  const [showDelete,   setShowDelete]   = useState(false);
  const [isDeleting,   setIsDeleting]   = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const router = useRouter();
  const { success, error } = useToast();

  const handleDelete = async () => {
    setIsDeleting(true);
    const result = await deleteChampion(champion.id);
    setIsDeleting(false);
    if (result.error) {
      error(result.error);
    } else {
      success('Champion designation removed');
      router.push('/crm/champions');
    }
  };

  const contactName = `${champion.contacts.first_name} ${champion.contacts.last_name}`;

  return (
    <div className={styles.detailPage}>
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <h1 className={styles.headerName}>{contactName}</h1>
          <div className={styles.headerMeta}>
            {champion.contacts.job_title && (
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                {champion.contacts.job_title}
              </span>
            )}
            {champion.companies && (
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
                @ {champion.companies.name}
              </span>
            )}
            <StatusChip
              label={CHAMPION_STATUS_LABELS[champion.status as ChampionStatus] ?? champion.status}
              color={STATUS_COLORS[champion.status] ?? 'neutral'}
            />
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>
            <Pencil size={14} strokeWidth={1.5} /> Edit
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowDelete(true)}>
            <Trash2 size={14} strokeWidth={1.5} />
          </Button>
        </div>
      </div>

      {/* Champion meta */}
      <div className={styles.card}>
        <p className={styles.cardTitle}>Champion details</p>
        <div className={styles.grid}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Role</span>
            <StatusChip
              label={CHAMPION_ROLE_TYPE_LABELS[champion.role_type as ChampionRoleType] ?? champion.role_type}
              color="neutral"
            />
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Score</span>
            <div className={styles.score}>
              {[1,2,3,4,5].map((n) => (
                <div key={n} className={`${styles.scoreDot} ${n <= champion.champion_score ? styles.scoreDotFilled : ''}`} />
              ))}
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginLeft: 4 }}>
                {champion.champion_score}/5
              </span>
            </div>
          </div>
          {champion.last_contacted_at && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Last contacted</span>
              <span className={styles.fieldValue}>{formatRelativeDate(champion.last_contacted_at)}</span>
            </div>
          )}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Tracking since</span>
            <span className={styles.fieldValue}>{formatRelativeDate(champion.created_at)}</span>
          </div>
        </div>
        {champion.notes && (
          <div className={styles.field} style={{ marginTop: 'var(--space-4)' }}>
            <span className={styles.fieldLabel}>Notes</span>
            <p className={styles.notesText}>{champion.notes}</p>
          </div>
        )}
      </div>

      {/* Contact info */}
      <div className={styles.card}>
        <p className={styles.cardTitle}>Contact info</p>
        <div className={styles.grid}>
          {champion.contacts.email && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Email</span>
              <span className={styles.fieldValue}>{champion.contacts.email}</span>
            </div>
          )}
          {champion.contacts.pipeline_stage && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Pipeline stage</span>
              <span className={styles.fieldValue}>{champion.contacts.pipeline_stage}</span>
            </div>
          )}
        </div>
      </div>

      {/* Event log */}
      <div className={styles.card}>
        <p className={styles.cardTitle}>Event history</p>
        <ChampionEventLog championId={champion.id} initialEvents={events} />
      </div>

      {/* Edit slide-over */}
      <SlideOver
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="Edit champion"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="champion-form" loading={isSubmitting}>Save changes</Button>
          </>
        }
      >
        <ChampionForm
          champion={{ ...champion, contacts: { ...champion.contacts, pipeline_stage: null }, companies: champion.companies }}
          contacts={contacts}
          companies={companies}
          onSuccess={() => { setShowEdit(false); router.refresh(); }}
          onPendingChange={setIsSubmitting}
        />
      </SlideOver>

      {/* Delete confirm */}
      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Remove champion designation"
        description={`Remove champion designation for ${contactName}? The contact record will not be deleted.`}
        confirmLabel="Remove"
        destructive
        loading={isDeleting}
      />
    </div>
  );
}
