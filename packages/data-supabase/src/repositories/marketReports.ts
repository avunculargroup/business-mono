import type { Finding } from '@platform/shared';
import type {
  MarketReportDetail,
  MarketReportRepository,
  MarketReportStatus,
  MarketReportSummary,
  Paginated,
  QueryOptions,
  ReadContext,
  ReportFeedbackEntry,
} from '@platform/data';
import type { SupabaseAdapterContext } from '../adapterContext';

const SUMMARY_COLUMNS =
  'id, as_of, status, report_mode, narration_markdown, emailed' as const;

/** Matches the page size the list has always used. */
const REPORT_LIMIT = 30;

/** The excerpt the distiller reads. Long enough to judge, short enough to store. */
const EXCERPT_MAX = 500;

type SummaryRow = {
  id: string;
  as_of: string;
  status: string;
  report_mode: string;
  narration_markdown: string | null;
  emailed: boolean;
};

function toSummary(row: SummaryRow): MarketReportSummary {
  return {
    id: row.id,
    asOf: row.as_of,
    // Both columns carry CHECK constraints the generated types do not reflect.
    status: row.status as MarketReportStatus,
    narrationMarkdown: row.narration_markdown,
    emailed: row.emailed,
    isQuietDay: row.report_mode === 'quiet',
  };
}

/**
 * The findings the narrator was handed.
 *
 * Anything that is not an array reads as none rather than throwing: this is a
 * JSONB audit trail written by the findings engine, and a malformed row must
 * not take out the page that exists to show what the engine did.
 */
function toFindings(value: unknown): Finding[] {
  return Array.isArray(value) ? (value as Finding[]) : [];
}

export function createMarketReportRepository(
  adapter: SupabaseAdapterContext,
): MarketReportRepository {
  const { client, principal } = adapter;

  return {
    async listReports(
      _ctx: ReadContext,
      opts?: QueryOptions,
    ): Promise<Paginated<MarketReportSummary>> {
      const limit = opts?.limit ?? REPORT_LIMIT;
      const offset = opts?.offset ?? 0;

      const { data, count, error } = await client
        .from('market_reports')
        .select(SUMMARY_COLUMNS, { count: 'exact' })
        .order('as_of', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const items = (data ?? []).map(toSummary);
      const total = count ?? items.length;

      return { items, total, hasMore: offset + items.length < total };
    },

    async getReport(_ctx: ReadContext, id: string): Promise<MarketReportDetail | null> {
      const { data: report, error } = await client
        .from('market_reports')
        .select(`${SUMMARY_COLUMNS}, findings`)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!report) return null;

      const { data: feedback, error: feedbackError } = await client
        .from('market_report_feedback')
        .select('id, verdict, feedback, created_at')
        .eq('market_report_id', report.id)
        .order('created_at', { ascending: false });

      if (feedbackError) throw feedbackError;

      return {
        ...toSummary(report),
        // The payload the narrator received — and nothing else. Keeping this
        // separate from `narrationMarkdown` is what makes the deterministic
        // step visible rather than something the reader has to take on trust.
        findings: toFindings(report.findings),
        priorFeedback: ((feedback ?? []) as ReportFeedbackRow[]).map((row) => ({
          id: row.id,
          verdict: row.verdict as ReportFeedbackEntry['verdict'],
          feedback: row.feedback,
          createdAt: row.created_at,
        })),
      };
    },

    async addReportFeedback(
      id: string,
      input: { feedback: string; verdict?: 'positive' | 'negative' },
    ): Promise<boolean> {
      const { data: report, error: readError } = await client
        .from('market_reports')
        .select('id, narration_markdown')
        .eq('id', id)
        .maybeSingle();

      if (readError) throw readError;
      if (!report) return false;

      const { error } = await client.from('market_report_feedback').insert({
        market_report_id: report.id,
        verdict: input.verdict ?? null,
        feedback: input.feedback.trim(),
        // Snapshot so the distiller needs no joins — the insert itself wakes it
        // through Realtime.
        narration_excerpt: report.narration_markdown
          ? report.narration_markdown.slice(0, EXCERPT_MAX)
          : null,
        created_by: principal.userId,
      });

      if (error) throw error;
      return true;
    },
  };
}

type ReportFeedbackRow = {
  id: string;
  verdict: string | null;
  feedback: string;
  created_at: string;
};
