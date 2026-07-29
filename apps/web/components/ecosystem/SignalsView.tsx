'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Check, Pin, PinOff, X, ExternalLink, MessageSquarePlus, UserCheck, Radar,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StatusChip } from '@/components/ui/StatusChip';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/providers/ToastProvider';
import {
  acknowledgeChange, flagClientRelevant, pinChange, setChangeStatus, setCuratorNote,
} from '@/app/actions/ecosystem';
import {
  ECOSYSTEM_CHANGE_TYPE_LABELS, ECOSYSTEM_COMPLIANCE_CLASS_LABELS,
} from '@platform/shared';
import { formatRelativeDate } from '@/lib/utils';
import styles from './SignalsView.module.css';

export type FeedChange = {
  id: string | null;
  change_type: string | null;
  title: string | null;
  summary: string | null;
  severity: string | null;
  materiality: number | null;
  compliance_class: string | null;
  status: string | null;
  pinned: boolean | null;
  client_relevant: boolean | null;
  curator_note: string | null;
  occurred_at: string | null;
  detected_at: string | null;
  external_url: string | null;
  entity_name: string | null;
  product_service_id: string | null;
  advisor_partner_id: string | null;
  product_slug: string | null;
  advisor_slug: string | null;
  watch_label: string | null;
  watch_type: string | null;
};

export type WatchHealthRow = {
  id: string | null;
  label: string | null;
  watch_type: string | null;
  health: string | null;
  check_frequency: string | null;
  consecutive_failures: number | null;
  last_checked_at: string | null;
  last_change_at: string | null;
  days_since_check: number | null;
  entity_name: string | null;
  owner_name: string | null;
};

interface SignalsViewProps {
  changes: FeedChange[];
  watchHealth: WatchHealthRow[];
}

/**
 * Severity colour, and the one rule that matters here: a change is never
 * success-green. `change_type` carries no valence at all — a release is an
 * event, not good news — and only the severity band is allowed to reach for the
 * warning/destructive palette, because a publisher calling an advisory critical
 * is a fact rather than an opinion.
 */
function severityColor(severity: string | null): 'neutral' | 'warning' | 'destructive' {
  if (severity === 'critical') return 'destructive';
  if (severity === 'high') return 'warning';
  return 'neutral';
}

function entityHref(change: FeedChange): string | null {
  if (change.product_slug) return `/products/${change.product_slug}`;
  if (change.advisor_slug) return `/advisors/${change.advisor_slug}`;
  return null;
}

const ALL = 'all';

export function SignalsView({ changes: initialChanges, watchHealth }: SignalsViewProps) {
  const { success, error } = useToast();
  const [changes, setChanges] = useState(initialChanges);
  const [tab, setTab] = useState<'feed' | 'health'>('feed');

  const [entity, setEntity] = useState<string>(ALL);
  const [changeType, setChangeType] = useState<string>(ALL);
  const [severity, setSeverity] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [clientOnly, setClientOnly] = useState(false);
  const [query, setQuery] = useState('');

  const [noteTarget, setNoteTarget] = useState<FeedChange | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Options come from what is actually in the feed, so a filter never offers a
  // value that would return nothing.
  const entities = useMemo(
    () => [...new Set(changes.map((c) => c.entity_name).filter((n): n is string => !!n))].sort(),
    [changes],
  );
  const changeTypes = useMemo(
    () => [...new Set(changes.map((c) => c.change_type).filter((t): t is string => !!t))].sort(),
    [changes],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return changes
      .filter((c) => entity === ALL || c.entity_name === entity)
      .filter((c) => changeType === ALL || c.change_type === changeType)
      .filter((c) => severity === ALL || c.severity === severity)
      .filter((c) => status === ALL || c.status === status)
      .filter((c) => !clientOnly || c.client_relevant)
      .filter(
        (c) =>
          q === '' ||
          (c.title ?? '').toLowerCase().includes(q) ||
          (c.summary ?? '').toLowerCase().includes(q) ||
          (c.entity_name ?? '').toLowerCase().includes(q),
      );
  }, [changes, entity, changeType, severity, status, clientOnly, query]);

  const patch = (id: string, fields: Partial<FeedChange>) =>
    setChanges((prev) => prev.map((c) => (c.id === id ? { ...c, ...fields } : c)));

  const handleAcknowledge = async (change: FeedChange) => {
    if (!change.id) return;
    const result = await acknowledgeChange(change.id);
    if ('error' in result) { error(result.error!); return; }
    patch(change.id, { status: 'acknowledged' });
    success('Change acknowledged');
  };

  const handleDismiss = async (change: FeedChange) => {
    if (!change.id) return;
    const result = await setChangeStatus(change.id, 'dismissed');
    if ('error' in result) { error(result.error!); return; }
    // The feed view excludes dismissed changes, so drop it from the list too.
    setChanges((prev) => prev.filter((c) => c.id !== change.id));
    success('Change dismissed');
  };

  const handlePin = async (change: FeedChange) => {
    if (!change.id) return;
    const next = !change.pinned;
    const result = await pinChange(change.id, next);
    if ('error' in result) { error(result.error!); return; }
    patch(change.id, { pinned: next });
  };

  const handleFlag = async (change: FeedChange) => {
    if (!change.id) return;
    const next = !change.client_relevant;
    const result = await flagClientRelevant(change.id, next);
    // The compliance gate refuses non-neutral and unclassified changes. Surface
    // its reason as-is rather than a generic failure — it explains what to do.
    if ('error' in result) { error(result.error!); return; }
    patch(change.id, { client_relevant: next });
    success(next ? 'Flagged for clients' : 'Client flag removed');
  };

  const handleSaveNote = async () => {
    if (!noteTarget?.id) return;
    setIsSavingNote(true);
    const formData = new FormData();
    formData.append('note', noteDraft);
    const result = await setCuratorNote(noteTarget.id, formData);
    setIsSavingNote(false);
    if ('error' in result) { error(result.error!); return; }
    patch(noteTarget.id, { curator_note: noteDraft || null });
    setNoteTarget(null);
    success('Note saved');
  };

  const degraded = watchHealth.filter((w) => w.health !== 'healthy').length;

  return (
    <div className={styles.page}>
      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'feed'}
          className={`${styles.tab} ${tab === 'feed' ? styles.tabActive : ''}`}
          onClick={() => setTab('feed')}
        >
          Feed
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'health'}
          className={`${styles.tab} ${tab === 'health' ? styles.tabActive : ''}`}
          onClick={() => setTab('health')}
        >
          Watch health
          {degraded > 0 && <span className={styles.tabCount}>{degraded}</span>}
        </button>
      </div>

      {tab === 'feed' ? (
        <>
          <div className={styles.controls}>
            <input
              type="search"
              className={styles.search}
              placeholder="Filter by entity or wording"
              aria-label="Filter changes"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className={styles.select}
              aria-label="Entity"
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
            >
              <option value={ALL}>All entities</option>
              {entities.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <select
              className={styles.select}
              aria-label="Change type"
              value={changeType}
              onChange={(e) => setChangeType(e.target.value)}
            >
              <option value={ALL}>All types</option>
              {changeTypes.map((type) => (
                <option key={type} value={type}>
                  {ECOSYSTEM_CHANGE_TYPE_LABELS[type as keyof typeof ECOSYSTEM_CHANGE_TYPE_LABELS] ?? type}
                </option>
              ))}
            </select>
            <select
              className={styles.select}
              aria-label="Severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value={ALL}>Any severity</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Info</option>
            </select>
            <select
              className={styles.select}
              aria-label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value={ALL}>Any status</option>
              <option value="new">New</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="actioned">Actioned</option>
            </select>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={clientOnly}
                onChange={(e) => setClientOnly(e.target.checked)}
              />
              Client-flagged
            </label>
          </div>

          {shown.length > 0 ? (
            <div className={styles.list}>
              {shown.map((change) => {
                const href = entityHref(change);
                return (
                  <article key={change.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <div className={styles.rowHead}>
                        <StatusChip
                          label={
                            ECOSYSTEM_CHANGE_TYPE_LABELS[
                              change.change_type as keyof typeof ECOSYSTEM_CHANGE_TYPE_LABELS
                            ] ?? change.change_type ?? 'Change'
                          }
                          color="neutral"
                        />
                        {href ? (
                          <Link href={href} className={styles.entity}>{change.entity_name}</Link>
                        ) : (
                          <span className={styles.entity}>{change.entity_name}</span>
                        )}
                        <span className={styles.title}>{change.title}</span>
                      </div>

                      {change.summary ? (
                        <p className={styles.summary}>{change.summary}</p>
                      ) : (
                        // Detection committed the facts; enrichment has not run
                        // or was withheld. Say so rather than showing a gap.
                        <p className={styles.summaryPending}>Not yet summarised.</p>
                      )}

                      {change.curator_note && (
                        <p className={styles.curatorNote}>{change.curator_note}</p>
                      )}

                      <div className={styles.rowMeta}>
                        <span className={styles.mono}>
                          {change.occurred_at
                            ? formatRelativeDate(change.occurred_at)
                            : change.detected_at
                              ? `Detected ${formatRelativeDate(change.detected_at)}`
                              : ''}
                        </span>
                        {change.watch_label && <span>{change.watch_label}</span>}
                        {change.compliance_class && change.compliance_class !== 'neutral' && (
                          <span>
                            {ECOSYSTEM_COMPLIANCE_CLASS_LABELS[
                              change.compliance_class as keyof typeof ECOSYSTEM_COMPLIANCE_CLASS_LABELS
                            ] ?? change.compliance_class}
                          </span>
                        )}
                        {change.status !== 'new' && <span>{change.status}</span>}
                      </div>
                    </div>

                    <div className={styles.rowSide}>
                      {change.severity && (
                        <StatusChip label={change.severity} color={severityColor(change.severity)} />
                      )}
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          onClick={() => handlePin(change)}
                          aria-label={change.pinned ? `Unpin ${change.title}` : `Pin ${change.title}`}
                          title={change.pinned ? 'Unpin' : 'Pin to top'}
                        >
                          {change.pinned
                            ? <PinOff size={16} strokeWidth={1.5} />
                            : <Pin size={16} strokeWidth={1.5} />}
                        </button>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          onClick={() => { setNoteTarget(change); setNoteDraft(change.curator_note ?? ''); }}
                          aria-label={`Add a note to ${change.title}`}
                          title="Add a curator note"
                        >
                          <MessageSquarePlus size={16} strokeWidth={1.5} />
                        </button>
                        <button
                          type="button"
                          className={`${styles.iconBtn} ${change.client_relevant ? styles.iconBtnOn : ''}`}
                          onClick={() => handleFlag(change)}
                          aria-label={
                            change.client_relevant
                              ? `Remove client flag from ${change.title}`
                              : `Flag ${change.title} for clients`
                          }
                          title="Flag as client-relevant"
                        >
                          <UserCheck size={16} strokeWidth={1.5} />
                        </button>
                        {change.status === 'new' && (
                          <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={() => handleAcknowledge(change)}
                            aria-label={`Acknowledge ${change.title}`}
                            title="Acknowledge"
                          >
                            <Check size={16} strokeWidth={1.5} />
                          </button>
                        )}
                        <button
                          type="button"
                          className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                          onClick={() => handleDismiss(change)}
                          aria-label={`Dismiss ${change.title}`}
                          title="Dismiss"
                        >
                          <X size={16} strokeWidth={1.5} />
                        </button>
                        {change.external_url && (
                          <a
                            href={change.external_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.iconBtn}
                            aria-label={`Open the source for ${change.title}`}
                            title="Open source"
                          >
                            <ExternalLink size={16} strokeWidth={1.5} />
                          </a>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : changes.length === 0 ? (
            <EmptyState
              icon={Radar}
              title="Nothing has changed yet"
              description="Add a watch on a product or advisor and anything that moves will land here."
            />
          ) : (
            <EmptyState
              icon={Radar}
              title="No changes match"
              description="Try clearing a filter."
            />
          )}
        </>
      ) : (
        <div className={styles.list}>
          {watchHealth.length > 0 ? (
            watchHealth.map((watch) => (
              <div key={watch.id} className={styles.healthRow}>
                <span
                  className={`${styles.dot} ${
                    watch.health === 'failing'
                      ? styles.dotFailing
                      : watch.health === 'degraded'
                        ? styles.dotDegraded
                        : ''
                  }`}
                />
                <div className={styles.rowMain}>
                  <span className={styles.title}>{watch.label}</span>
                  <div className={styles.rowMeta}>
                    <span>{watch.entity_name}</span>
                    <span className={styles.mono}>
                      {watch.last_checked_at
                        ? `Checked ${formatRelativeDate(watch.last_checked_at)}`
                        : 'Never checked'}
                    </span>
                    {(watch.consecutive_failures ?? 0) > 0 && (
                      <span className={styles.mono}>
                        {watch.consecutive_failures} consecutive failures
                      </span>
                    )}
                    {watch.owner_name && <span>{watch.owner_name}</span>}
                  </div>
                </div>
                <StatusChip
                  label={watch.health ?? 'unknown'}
                  color={
                    watch.health === 'failing'
                      ? 'destructive'
                      : watch.health === 'degraded'
                        ? 'warning'
                        : 'neutral'
                  }
                />
              </div>
            ))
          ) : (
            <EmptyState
              icon={Radar}
              title="No watches yet"
              description="Watches are added from a product or advisor page."
            />
          )}
        </div>
      )}

      <Modal
        open={noteTarget !== null}
        onClose={() => setNoteTarget(null)}
        title="Curator note"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNoteTarget(null)}>Cancel</Button>
            <Button variant="primary" onClick={handleSaveNote} loading={isSavingNote}>Save note</Button>
          </>
        }
      >
        <label className={styles.noteLabel} htmlFor="curator-note">
          Why this matters
        </label>
        <textarea
          id="curator-note"
          className={styles.noteInput}
          rows={4}
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder="e.g. only affects the Mk3; most clients are on the Q"
        />
      </Modal>
    </div>
  );
}
