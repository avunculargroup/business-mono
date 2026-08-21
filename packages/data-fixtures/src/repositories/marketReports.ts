import type {
  MarketReportDetail,
  MarketReportRepository,
  MarketReportSummary,
  Paginated,
  QueryOptions,
  ReadContext,
} from '@platform/data';
import { blocked } from '../blocked';
import { paginate } from '../paginate';
import { marketReports } from '../fixtures';

export function createMarketReportRepository(): MarketReportRepository {
  return {
    async listReports(
      ctx: ReadContext,
      opts?: QueryOptions,
    ): Promise<Paginated<MarketReportSummary>> {
      // Newest first, by the date the report covers. Sorted rather than
      // fixture-ordered so the contract's descending check is testing the
      // adapter and not the order someone happened to type the rows in.
      const rows = [...marketReports(ctx.asOf)].sort((a, b) => b.asOf.localeCompare(a.asOf));
      return paginate(rows, opts);
    },

    async getReport(ctx: ReadContext, id: string): Promise<MarketReportDetail | null> {
      return marketReports(ctx.asOf).find((report) => report.id === id) ?? null;
    },

    async addReportFeedback(): Promise<boolean> {
      return blocked('addReportFeedback', 'market_report_feedback');
    },
  };
}
