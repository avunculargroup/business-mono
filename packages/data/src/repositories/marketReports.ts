import type { Finding } from '@platform/shared';
import type { Paginated, QueryOptions, ReadContext } from '../context';

/**
 * `published` — the narration passed lint and Lex and went into the email.
 * `held` — it failed review and was withheld; the email went without it.
 * `error` — the pipeline failed before producing a narration at all.
 */
export type MarketReportStatus = 'published' | 'held' | 'error';

export interface MarketReportSummary {
  id: string;
  /** The UTC date the report covers. Unique — one report per day. */
  asOf: string;
  status: MarketReportStatus;
  narrationMarkdown: string | null;
  emailed: boolean;
  /**
   * Nothing cleared the materiality floor that day.
   *
   * Derived from `report_mode`, which the model does not otherwise expose: the
   * only question anything asks of it is whether the day was quiet.
   */
  isQuietDay: boolean;
}

export interface ReportFeedbackEntry {
  id: string;
  verdict: 'positive' | 'negative' | null;
  feedback: string;
  createdAt: string;
}

/**
 * One day's report.
 *
 * The `findings` / `narrationMarkdown` split is the point of this surface and
 * the adapter preserves it exactly: `findings` is the payload the narrating
 * agent was handed, and `narrationMarkdown` is what it produced from that and
 * nothing else. This is where the `deterministic-before-llm` annotation
 * attaches — to the boundary between the two fields.
 *
 * `findings` is typed as the engine's own `Finding`, snake_case and all,
 * because that is what the engine writes into the JSONB. Same rule as the
 * campaign workflow's payloads: the read model describes what is stored.
 */
export interface MarketReportDetail extends MarketReportSummary {
  findings: Finding[];
  priorFeedback: ReportFeedbackEntry[];
}

export interface MarketReportRepository {
  /** Newest first. */
  listReports(
    ctx: ReadContext,
    opts?: QueryOptions,
  ): Promise<Paginated<MarketReportSummary>>;

  getReport(ctx: ReadContext, id: string): Promise<MarketReportDetail | null>;

  /**
   * Record feedback on a report's narration.
   *
   * Returns false when the report is gone. The snapshot of the narration —
   * taken so the agents-side distiller needs no joins — is the adapter's, as is
   * who left the feedback, which comes from the bound principal.
   */
  addReportFeedback(
    id: string,
    input: { feedback: string; verdict?: 'positive' | 'negative' },
  ): Promise<boolean>;
}
