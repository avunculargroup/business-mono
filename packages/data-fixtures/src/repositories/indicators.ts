import type { DashboardIndicators, IndicatorsRepository, ReadContext } from '@platform/data';
import { indicators } from '../fixtures';

/**
 * The one domain with no writes at all — indicators are ingested by the agents
 * side and only ever read here, so there is nothing for `blocked` to refuse.
 */
export function createIndicatorsRepository(): IndicatorsRepository {
  return {
    async getDashboard(ctx: ReadContext): Promise<DashboardIndicators> {
      return indicators(ctx.asOf);
    },
  };
}
