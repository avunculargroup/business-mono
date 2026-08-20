import type {
  EcosystemChange,
  EcosystemRepository,
  EcosystemWatch,
  PromotionGate,
  ReadContext,
  WatchHealth,
} from '@platform/data';
import { blocked } from '../blocked';
import { ecosystemChanges, watchHealth } from '../fixtures';

export function createEcosystemRepository(): EcosystemRepository {
  return {
    async listFeed(ctx: ReadContext, opts?: { limit?: number }): Promise<EcosystemChange[]> {
      const rows = [...ecosystemChanges(ctx.asOf)].sort((a, b) =>
        (b.detectedAt ?? '').localeCompare(a.detectedAt ?? ''),
      );
      return opts?.limit === undefined ? rows : rows.slice(0, opts.limit);
    },

    async listWatchHealth(ctx: ReadContext): Promise<WatchHealth[]> {
      // The live adapter reads a view that sorts failing-then-stale. The
      // fixture rows are authored in that order, and the demo has to show the
      // same shape of list, so the ordering is asserted rather than re-derived
      // from a health ranking this adapter would have to invent.
      return watchHealth(ctx.asOf);
    },

    async getPromotionGate(ctx: ReadContext, id: string): Promise<PromotionGate | null> {
      const change = ecosystemChanges(ctx.asOf).find((row) => row.id === id);
      if (!change) return null;
      return { complianceClass: change.complianceClass };
    },

    async acknowledgeChange(): Promise<void> {
      return blocked('acknowledgeChange', 'ecosystem_changes');
    },

    async setChangeStatus(): Promise<void> {
      return blocked('setChangeStatus', 'ecosystem_changes');
    },

    async pinChange(): Promise<void> {
      return blocked('pinChange', 'ecosystem_changes');
    },

    async setCuratorNote(): Promise<void> {
      return blocked('setCuratorNote', 'ecosystem_changes');
    },

    async setClientRelevant(): Promise<void> {
      return blocked('setClientRelevant', 'ecosystem_changes');
    },

    async createWatch(): Promise<EcosystemWatch> {
      return blocked('createWatch', 'ecosystem_watches');
    },

    async updateWatch(): Promise<void> {
      return blocked('updateWatch', 'ecosystem_watches');
    },

    async setWatchEnabled(): Promise<void> {
      return blocked('setWatchEnabled', 'ecosystem_watches');
    },

    async deleteWatch(): Promise<void> {
      return blocked('deleteWatch', 'ecosystem_watches');
    },
  };
}
