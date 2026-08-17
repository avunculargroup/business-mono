'use client';

import { useCallback, useState } from 'react';
import { Plus, X, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { StatusChip } from '@/components/ui/StatusChip';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@platform/ui/ToastProvider';
import { deleteWatch, setWatchEnabled } from '@/app/actions/ecosystem';
import { ECOSYSTEM_WATCH_TYPE_LABELS } from '@platform/shared';
import { formatDate } from '@/lib/utils';
import { EcosystemWatchForm, type WatchRow } from './EcosystemWatchForm';
import styles from './WatchesCard.module.css';

interface WatchesCardProps {
  /** Exactly one of these — matching the watch's single-parent rule. */
  productServiceId?: string;
  advisorPartnerId?: string;
  watches: WatchRow[];
  teamMembers: { id: string; full_name: string }[];
}

function healthDotClass(health: string, enabled: boolean): string {
  if (!enabled) return `${styles.dot} ${styles.dotDisabled}`;
  if (health === 'failing') return `${styles.dot} ${styles.dotFailing}`;
  if (health === 'degraded') return `${styles.dot} ${styles.dotDegraded}`;
  return styles.dot;
}

function healthLabel(health: string, enabled: boolean): string {
  if (!enabled) return 'Paused';
  if (health === 'failing') return 'Failing';
  if (health === 'degraded') return 'Degraded';
  return 'Healthy';
}

export function WatchesCard({
  productServiceId,
  advisorPartnerId,
  watches: initialWatches,
  teamMembers,
}: WatchesCardProps) {
  const { success, error } = useToast();
  const [watches, setWatches] = useState(initialWatches);
  const [showAdd, setShowAdd] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WatchRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleAdded = useCallback((watch: WatchRow) => {
    setWatches((prev) => [watch, ...prev]);
    setShowAdd(false);
  }, []);

  const handleToggle = async (watch: WatchRow) => {
    const next = !watch.enabled;
    const result = await setWatchEnabled(watch.id, next);
    if ('error' in result) {
      error(result.error!);
      return;
    }
    setWatches((prev) => prev.map((w) => (w.id === watch.id ? { ...w, enabled: next } : w)));
    success(next ? 'Watch resumed' : 'Watch paused');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const result = await deleteWatch(deleteTarget.id, productServiceId, advisorPartnerId);
    setIsDeleting(false);
    if ('error' in result) {
      error(result.error!);
      return;
    }
    setWatches((prev) => prev.filter((w) => w.id !== deleteTarget.id));
    setDeleteTarget(null);
    success('Watch removed');
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardTitle}>Watches</span>
        <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)}>
          <Plus size={14} strokeWidth={1.5} />
          Add watch
        </Button>
      </div>

      {watches.length > 0 ? (
        watches.map((watch) => (
          <div key={watch.id} className={styles.itemRow}>
            <span
              className={healthDotClass(watch.health, watch.enabled)}
              title={healthLabel(watch.health, watch.enabled)}
            />
            <div className={styles.itemBody}>
              <span className={styles.itemName}>{watch.label}</span>
              <span className={styles.itemMeta}>
                {watch.last_checked_at ? (
                  <>
                    Last checked <span className={styles.mono}>{formatDate(watch.last_checked_at)}</span>
                  </>
                ) : (
                  'Not checked yet'
                )}
              </span>
            </div>
            <StatusChip
              label={ECOSYSTEM_WATCH_TYPE_LABELS[
                watch.watch_type as keyof typeof ECOSYSTEM_WATCH_TYPE_LABELS
              ] ?? watch.watch_type}
              color="neutral"
            />
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => handleToggle(watch)}
              aria-label={watch.enabled ? `Pause ${watch.label}` : `Resume ${watch.label}`}
              title={watch.enabled ? 'Pause watch' : 'Resume watch'}
            >
              {watch.enabled ? <Pause size={14} strokeWidth={1.5} /> : <Play size={14} strokeWidth={1.5} />}
            </button>
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.removeBtn}`}
              onClick={() => setDeleteTarget(watch)}
              aria-label={`Remove ${watch.label}`}
              title="Remove watch"
            >
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
        ))
      ) : (
        <div className={styles.emptyCard}>
          No watches yet. Add one to be told when this changes.
        </div>
      )}

      <SlideOver
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add watch"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="watch-form" loading={isSubmitting}>
              Save watch
            </Button>
          </>
        }
      >
        <EcosystemWatchForm
          productServiceId={productServiceId}
          advisorPartnerId={advisorPartnerId}
          teamMembers={teamMembers}
          onSuccess={handleAdded}
          onPendingChange={setIsSubmitting}
        />
      </SlideOver>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remove watch"
        description={`Remove "${deleteTarget?.label}"? This will also remove every change it has detected.`}
        confirmLabel="Remove watch"
        destructive
        loading={isDeleting}
      />
    </div>
  );
}
