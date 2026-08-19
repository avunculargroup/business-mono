import type { Json } from '@platform/db';
import type {
  EcosystemChange,
  EcosystemRepository,
  EcosystemWatch,
  NewWatch,
  PromotionGate,
  ReadContext,
  WatchEdit,
  WatchHealth,
} from '@platform/data';
import type { SupabaseAdapterContext } from '../adapterContext';

/** The cap the feed has always used. */
const FEED_LIMIT = 200;

type FeedRow = {
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

type WatchHealthRow = {
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

function toChange(row: FeedRow): EcosystemChange {
  return {
    id: row.id,
    changeType: row.change_type,
    title: row.title,
    summary: row.summary,
    severity: row.severity,
    materiality: row.materiality,
    complianceClass: row.compliance_class,
    status: row.status,
    pinned: row.pinned,
    clientRelevant: row.client_relevant,
    curatorNote: row.curator_note,
    occurredAt: row.occurred_at,
    detectedAt: row.detected_at,
    externalUrl: row.external_url,
    entityName: row.entity_name,
    productServiceId: row.product_service_id,
    advisorPartnerId: row.advisor_partner_id,
    productSlug: row.product_slug,
    advisorSlug: row.advisor_slug,
    watchLabel: row.watch_label,
    watchType: row.watch_type,
  };
}

function toWatchHealth(row: WatchHealthRow): WatchHealth {
  return {
    id: row.id,
    label: row.label,
    watchType: row.watch_type,
    health: row.health,
    checkFrequency: row.check_frequency,
    consecutiveFailures: row.consecutive_failures,
    lastCheckedAt: row.last_checked_at,
    lastChangeAt: row.last_change_at,
    daysSinceCheck: row.days_since_check,
    entityName: row.entity_name,
    ownerName: row.owner_name,
  };
}

/** The columns a watch write sets, shared by create and update. */
function watchColumns(input: WatchEdit) {
  return {
    watch_type: input.watchType,
    label: input.label,
    config: input.config as unknown as Json,
    source_url: input.sourceUrl,
    check_frequency: input.checkFrequency,
    enabled: input.enabled,
    centrality: input.centrality,
    owner_id: input.ownerId,
    notes: input.notes,
  };
}

export function createEcosystemRepository(
  adapter: SupabaseAdapterContext,
): EcosystemRepository {
  const { client, principal } = adapter;

  return {
    async listFeed(_ctx: ReadContext, opts?: { limit?: number }): Promise<EcosystemChange[]> {
      // The view, not the base table: it already excludes dismissed and
      // archived changes and carries the entity context and slugs the rows need.
      const { data, error } = await client
        .from('v_ecosystem_feed')
        .select('*')
        .limit(opts?.limit ?? FEED_LIMIT);

      if (error) throw error;
      return ((data ?? []) as unknown as FeedRow[]).map(toChange);
    },

    async listWatchHealth(_ctx: ReadContext): Promise<WatchHealth[]> {
      // Already sorted failing-then-stale by the view.
      const { data, error } = await client.from('v_ecosystem_watch_health').select('*');

      if (error) throw error;
      return ((data ?? []) as unknown as WatchHealthRow[]).map(toWatchHealth);
    },

    async getPromotionGate(_ctx: ReadContext, id: string): Promise<PromotionGate | null> {
      const { data, error } = await client
        .from('ecosystem_changes')
        .select('compliance_class')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return { complianceClass: data.compliance_class };
    },

    async acknowledgeChange(id: string): Promise<void> {
      const { error } = await client
        .from('ecosystem_changes')
        .update({
          status: 'acknowledged',
          // From the bound principal, never from an argument.
          acknowledged_by: principal.userId,
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    },

    async setChangeStatus(id: string, status: string): Promise<void> {
      const { error } = await client.from('ecosystem_changes').update({ status }).eq('id', id);
      if (error) throw error;
    },

    async pinChange(id: string, pinned: boolean): Promise<void> {
      const { error } = await client.from('ecosystem_changes').update({ pinned }).eq('id', id);
      if (error) throw error;
    },

    async setCuratorNote(id: string, note: string | null): Promise<void> {
      const { error } = await client
        .from('ecosystem_changes')
        .update({ curator_note: note })
        .eq('id', id);

      if (error) throw error;
    },

    async setClientRelevant(id: string, flag: boolean): Promise<void> {
      const { error } = await client
        .from('ecosystem_changes')
        .update({ client_relevant: flag })
        .eq('id', id);

      if (error) throw error;
    },

    async createWatch(input: NewWatch): Promise<EcosystemWatch> {
      const { data, error } = await client
        .from('ecosystem_watches')
        .insert({
          product_service_id: input.productServiceId,
          advisor_partner_id: input.advisorPartnerId,
          created_by: input.createdBy,
          ...watchColumns(input),
        })
        .select('id, watch_type, label, source_url, enabled, check_frequency, health, last_checked_at, last_change_at')
        .single();

      if (error) throw error;

      return {
        id: data.id,
        watchType: data.watch_type,
        label: data.label,
        sourceUrl: data.source_url,
        enabled: data.enabled,
        checkFrequency: data.check_frequency,
        health: data.health,
        lastCheckedAt: data.last_checked_at,
        lastChangeAt: data.last_change_at,
      };
    },

    async updateWatch(id: string, input: WatchEdit): Promise<void> {
      // The parent entity is deliberately not settable: a watch that changed
      // entity would orphan its existing changes' denormalised entity_name.
      const { error } = await client
        .from('ecosystem_watches')
        .update(watchColumns(input))
        .eq('id', id);

      if (error) throw error;
    },

    async setWatchEnabled(id: string, enabled: boolean): Promise<void> {
      const { error } = await client.from('ecosystem_watches').update({ enabled }).eq('id', id);
      if (error) throw error;
    },

    async deleteWatch(id: string): Promise<void> {
      const { error } = await client.from('ecosystem_watches').delete().eq('id', id);
      if (error) throw error;
    },
  };
}
