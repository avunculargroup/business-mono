import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Selection } from '@platform/shared';
import { buildFinding } from '../../../test/factories.js';
import { makeConfig } from './__fixtures__/series.js';

const loadFindingConfig = vi.fn();
const loadActiveWatches = vi.fn();
const loadObservationBundle = vi.fn();
const loadReportGuidelines = vi.fn();
const upsertMarketReport = vi.fn();
const markReportEmailed = vi.fn();
const computeFindings = vi.fn();
const scoreAndSelect = vi.fn();
const narrateFindings = vi.fn();
const reviewNarrationForCompliance = vi.fn();
const recordNarrationReview = vi.fn();

vi.mock('./config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./config.js')>()),
  loadFindingConfig: (...args: unknown[]) => loadFindingConfig(...(args as [])),
  loadActiveWatches: (...args: unknown[]) => loadActiveWatches(...(args as [])),
}));
vi.mock('./dataAccess.js', () => ({
  loadObservationBundle: (...args: unknown[]) => loadObservationBundle(...(args as [])),
  loadReportGuidelines: (...args: unknown[]) => loadReportGuidelines(...(args as [])),
  upsertMarketReport: (...args: unknown[]) => upsertMarketReport(...(args as [])),
  markReportEmailed: (...args: unknown[]) => markReportEmailed(...(args as [])),
}));
vi.mock('./computors/index.js', () => ({
  computeFindings: (...args: unknown[]) => computeFindings(...(args as [])),
}));
vi.mock('./materiality.js', () => ({
  scoreAndSelect: (...args: unknown[]) => scoreAndSelect(...(args as [])),
}));
vi.mock('./narration.js', () => ({
  narrateFindings: (...args: unknown[]) => narrateFindings(...(args as [])),
}));
vi.mock('./lexReview.js', () => ({
  reviewNarrationForCompliance: (...args: unknown[]) => reviewNarrationForCompliance(...(args as [])),
  recordNarrationReview: (...args: unknown[]) => recordNarrationReview(...(args as [])),
}));

const { generateFindingsNarration } = await import('./index.js');

const NOW = new Date('2026-07-18T22:30:00Z');

function selectionWith(findings: ReturnType<typeof buildFinding>[]): Selection {
  return { as_of: '2026-07-18', report_mode: 'normal', findings, ops_findings: [buildFinding({ finding_type: 'staleness', metric_key: 'macro:gold' })] };
}

const CLEAN_LINT = { pass: true, violations: [] };

beforeEach(() => {
  vi.clearAllMocks();
  loadFindingConfig.mockResolvedValue(makeConfig());
  loadActiveWatches.mockResolvedValue([]);
  loadReportGuidelines.mockResolvedValue([]);
  loadObservationBundle.mockResolvedValue({ asOf: '2026-07-18', series: {}, hashRibbons: [] });
  computeFindings.mockReturnValue([buildFinding()]);
  scoreAndSelect.mockReturnValue(selectionWith([buildFinding()]));
  narrateFindings.mockResolvedValue({
    narration: { narration_markdown: 'Hash rate fell 8% overnight.', findings_used: ['anomaly:hash_rate:2026-07-18'] },
    lint: CLEAN_LINT,
  });
  upsertMarketReport.mockResolvedValue('mr-1');
});

describe('generateFindingsNarration', () => {
  it('publishes without Lex when nothing is valuation-sensitive', async () => {
    const result = await generateFindingsNarration(NOW);
    expect(result.status).toBe('published');
    expect(result.narration).toBe('Hash rate fell 8% overnight.');
    expect(result.reportId).toBe('mr-1');
    expect(result.staleMetrics).toEqual(['macro:gold']);
    expect(reviewNarrationForCompliance).not.toHaveBeenCalled();
    expect(upsertMarketReport).toHaveBeenCalledWith(
      expect.objectContaining({ as_of: '2026-07-18', status: 'published', lex_result: null }),
    );
  });

  it('routes valuation-sensitive selections through Lex; pass → published + logged', async () => {
    scoreAndSelect.mockReturnValue(selectionWith([buildFinding({ compliance_class: 'valuation_sensitive' })]));
    reviewNarrationForCompliance.mockResolvedValue({ passes: true, flags: [], rationale: 'ok', suggested_rewrite: null });

    const result = await generateFindingsNarration(NOW);
    expect(reviewNarrationForCompliance).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('published');
    expect(recordNarrationReview).toHaveBeenCalledWith(expect.objectContaining({ passes: true }), 'mr-1');
  });

  it('Lex fail → held, narration withheld from the email', async () => {
    scoreAndSelect.mockReturnValue(selectionWith([buildFinding({ compliance_class: 'valuation_sensitive' })]));
    reviewNarrationForCompliance.mockResolvedValue({ passes: false, flags: [], rationale: 'advice framing', suggested_rewrite: null });

    const result = await generateFindingsNarration(NOW);
    expect(result.status).toBe('held');
    expect(result.narration).toBeNull();
    // The held narration is still persisted for review.
    expect(upsertMarketReport).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'held', narration_markdown: 'Hash rate fell 8% overnight.' }),
    );
  });

  it('hard lint failure after the corrective pass → held, Lex never runs', async () => {
    narrateFindings.mockResolvedValue({
      narration: { narration_markdown: 'Up 42.7%.', findings_used: [] },
      lint: { pass: false, violations: [{ rule: 'payload_only_numbers', severity: 'hard', detail: 'x' }] },
    });
    const result = await generateFindingsNarration(NOW);
    expect(result.status).toBe('held');
    expect(reviewNarrationForCompliance).not.toHaveBeenCalled();
  });

  it('no narration at all → error, still persisted', async () => {
    narrateFindings.mockResolvedValue({ narration: null, lint: null });
    const result = await generateFindingsNarration(NOW);
    expect(result.status).toBe('error');
    expect(upsertMarketReport).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', narration_markdown: null }),
    );
  });

  it('never throws — an upstream failure returns the empty result', async () => {
    loadObservationBundle.mockRejectedValue(new Error('db down'));
    const result = await generateFindingsNarration(NOW);
    expect(result).toMatchObject({ narration: null, status: null, reportId: null });
  });
});
