import type { ReadContext } from '../context';

/**
 * A detected change, from `v_ecosystem_feed`.
 *
 * The view already excludes dismissed and archived changes and carries the
 * entity context and slugs the rows need, so the adapter reads it rather than
 * the base table.
 *
 * **`complianceClass` is the surface's reason for existing.** Lex classifies
 * every change at ingest, and for this internal feed the classification is a
 * label. It becomes a gate the moment a change is promoted to a client — see
 * `setClientRelevant`. That is `compliance-as-alignment`: the compliance step
 * is not a checkpoint bolted on before publication, it is a property the record
 * has carried since it was detected.
 *
 * Note what this model does *not* carry: any notion of a change being good or
 * bad. `changeType` has no valence — a release is an event, not good news — and
 * `severity` is the publisher's own word for it, which is a fact rather than an
 * opinion. Same rule as the indicator deltas.
 */
export interface EcosystemChange {
  id: string | null;
  changeType: string | null;
  title: string | null;
  summary: string | null;
  severity: string | null;
  materiality: number | null;
  complianceClass: string | null;
  status: string | null;
  pinned: boolean | null;
  clientRelevant: boolean | null;
  curatorNote: string | null;
  occurredAt: string | null;
  detectedAt: string | null;
  externalUrl: string | null;
  entityName: string | null;
  productServiceId: string | null;
  advisorPartnerId: string | null;
  productSlug: string | null;
  advisorSlug: string | null;
  watchLabel: string | null;
  watchType: string | null;
}

/** A watch's health, from `v_ecosystem_watch_health` — already sorted failing-then-stale. */
export interface WatchHealth {
  id: string | null;
  label: string | null;
  watchType: string | null;
  health: string | null;
  checkFrequency: string | null;
  consecutiveFailures: number | null;
  lastCheckedAt: string | null;
  lastChangeAt: string | null;
  daysSinceCheck: number | null;
  entityName: string | null;
  ownerName: string | null;
}

/** A watch as the register's watch list renders it. */
export interface EcosystemWatch {
  id: string;
  watchType: string;
  label: string;
  sourceUrl: string | null;
  enabled: boolean;
  checkFrequency: string;
  health: string;
  lastCheckedAt: string | null;
  lastChangeAt: string | null;
}

/** What the client-promotion gate is decided from. */
export interface PromotionGate {
  /** Null when the classifier failed or has not run yet. */
  complianceClass: string | null;
}

export interface NewWatch {
  productServiceId: string | null;
  advisorPartnerId: string | null;
  watchType: string;
  label: string;
  /** Built by the app from the form; the adapter stores it as given. */
  config: Record<string, unknown>;
  sourceUrl: string | null;
  checkFrequency: string;
  enabled: boolean;
  centrality: number;
  ownerId: string | null;
  notes: string | null;
  createdBy: string | null;
}

/** A watch's editable fields. Its parent entity is set at creation and never moves. */
export type WatchEdit = Omit<
  NewWatch,
  'productServiceId' | 'advisorPartnerId' | 'createdBy'
>;

export interface EcosystemRepository {
  /** The signals feed. */
  listFeed(ctx: ReadContext, opts?: { limit?: number }): Promise<EcosystemChange[]>;

  /** Watch health, failing first. */
  listWatchHealth(ctx: ReadContext): Promise<WatchHealth[]>;

  /**
   * The compliance classification a promotion is judged against.
   *
   * Null return means the change is gone. A null `complianceClass` on a present
   * change is a different thing — unclassified — and the caller must refuse
   * that too. The rule itself (`isClientPromotable`) lives in
   * `@platform/shared`, so both this app and the agents side judge it the same
   * way; what the repository supplies is the fact.
   */
  getPromotionGate(ctx: ReadContext, id: string): Promise<PromotionGate | null>;

  /** Acknowledge a change. The acknowledger is the bound principal. */
  acknowledgeChange(id: string): Promise<void>;
  setChangeStatus(id: string, status: string): Promise<void>;
  pinChange(id: string, pinned: boolean): Promise<void>;
  setCuratorNote(id: string, note: string | null): Promise<void>;

  /** Queue a change for the client-facing app, or withdraw it. Gates are the caller's. */
  setClientRelevant(id: string, flag: boolean): Promise<void>;

  /** Returns the created watch, which the form hands straight to its list. */
  createWatch(input: NewWatch): Promise<EcosystemWatch>;
  updateWatch(id: string, input: WatchEdit): Promise<void>;
  setWatchEnabled(id: string, enabled: boolean): Promise<void>;
  /** Cascades to the watch's changes. */
  deleteWatch(id: string): Promise<void>;
}
