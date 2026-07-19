// The findings pipeline entry point, called from the market_report routine in
// place of the old free-form commentary. Deterministic end to end except one
// narration call: load series → compute findings → score/select → narrate
// (+lint, one corrective pass) → Lex review → persist market_reports.
//
// Best-effort contract (same as the commentary it replaces): this NEVER throws,
// and the email always sends — with the narration only when it earned
// 'published'. A failed narration is persisted as 'held' with its flags so the
// web page can show what was withheld and why.

import type { MarketReportMode, MarketReportStatus } from '@platform/shared';
import type { ComplianceVerdict } from '../../agents/compliance/index.js';
import { utcDate } from '../onchain/types.js';
import { createLogger } from '../logger.js';
import { loadActiveWatches, loadFindingConfig } from './config.js';
import { computeFindings } from './computors/index.js';
import {
  loadObservationBundle,
  loadReportGuidelines,
  markReportEmailed,
  upsertMarketReport,
} from './dataAccess.js';
import { reviewNarrationForCompliance, recordNarrationReview } from './lexReview.js';
import { scoreAndSelect } from './materiality.js';
import { narrateFindings } from './narration.js';

const log = createLogger('findings');

export { markReportEmailed };

export interface FindingsNarrationResult {
  // The narration to include in the email — non-null ONLY when status is 'published'.
  narration: string | null;
  status: MarketReportStatus | null; // null = the pipeline itself errored before persisting
  reportId: string | null;
  reportMode: MarketReportMode | null;
  findingsTotal: number;
  findingsSelected: number;
  staleMetrics: string[];
}

const EMPTY_RESULT: FindingsNarrationResult = {
  narration: null,
  status: null,
  reportId: null,
  reportMode: null,
  findingsTotal: 0,
  findingsSelected: 0,
  staleMetrics: [],
};

export async function generateFindingsNarration(now: Date = new Date()): Promise<FindingsNarrationResult> {
  try {
    const asOf = utcDate(now);

    // Deterministic stages.
    const config = await loadFindingConfig();
    const [watches, guidelines, bundle] = await Promise.all([
      loadActiveWatches(now),
      loadReportGuidelines(),
      loadObservationBundle(asOf, config),
    ]);
    const findings = computeFindings(bundle, config);
    const selection = scoreAndSelect(findings, config, watches, asOf);
    const staleMetrics = selection.ops_findings.map((f) => f.metric_key);

    // The one LLM call (+ deterministic lint with one corrective pass).
    const { narration, lint } = await narrateFindings(selection, guidelines);

    let status: MarketReportStatus;
    let lexResult: ComplianceVerdict | null = null;
    if (!narration) {
      status = 'error';
    } else if (lint && !lint.pass) {
      status = 'held';
    } else {
      const hasValuationSensitive = selection.findings.some(
        (f) => f.compliance_class === 'valuation_sensitive',
      );
      if (hasValuationSensitive) {
        const verdict = await reviewNarrationForCompliance({
          narration: narration.narration_markdown,
          findings: selection.findings,
        });
        lexResult = verdict;
        status = verdict.passes ? 'published' : 'held';
      } else {
        status = 'published';
      }
    }

    const reportId = await upsertMarketReport({
      as_of: asOf,
      status,
      report_mode: selection.report_mode,
      narration_markdown: narration?.narration_markdown ?? null,
      findings: selection.findings,
      ops_findings: selection.ops_findings,
      lint_result: lint,
      lex_result: lexResult,
    });

    // The Lex verdict is auditable regardless of outcome (when Lex ran).
    if (lexResult && reportId) {
      await recordNarrationReview(lexResult, reportId);
    }

    log.info(
      {
        asOf,
        status,
        reportMode: selection.report_mode,
        findingsTotal: findings.length,
        findingsSelected: selection.findings.length,
        staleMetrics,
      },
      'findings pipeline complete',
    );

    return {
      narration: status === 'published' ? narration!.narration_markdown : null,
      status,
      reportId,
      reportMode: selection.report_mode,
      findingsTotal: findings.length,
      findingsSelected: selection.findings.length,
      staleMetrics,
    };
  } catch (err) {
    log.error({ err }, 'findings pipeline failed — report email sends without narration');
    return EMPTY_RESULT;
  }
}
