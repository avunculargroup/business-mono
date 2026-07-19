import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';
import { buildFinding } from '../../../test/factories.js';

const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const lexGenerate = vi.fn();

vi.mock('@platform/db', () => ({
  get supabase() {
    return fakeSupabase;
  },
}));
vi.mock('../../config/model.js', () => ({
  stepRequestContext: vi.fn((scope: string) => ({ scope })),
  dynamicModelFor: vi.fn(() => 'mock-model'),
}));
vi.mock('../../agents/compliance/index.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../agents/compliance/index.js')>();
  return {
    ...original,
    lex: { generate: (...args: unknown[]) => lexGenerate(...(args as [])) },
  };
});

const { reviewNarrationForCompliance, recordNarrationReview } = await import('./lexReview.js');

const FINDINGS = [buildFinding({ compliance_class: 'valuation_sensitive' })];

beforeEach(() => {
  fakeSupabase.__builders.length = 0;
  fakeSupabase.__responses.clear();
  lexGenerate.mockReset();
});

describe('reviewNarrationForCompliance', () => {
  it('returns a passing verdict and uses the report step scope', async () => {
    lexGenerate.mockResolvedValueOnce({
      object: { passes: true, flags: [], rationale: 'Observational framing throughout.', suggested_rewrite: null },
    });
    const verdict = await reviewNarrationForCompliance({ narration: 'MVRV crossed below 1.0.', findings: FINDINGS });
    expect(verdict.passes).toBe(true);
    const options = lexGenerate.mock.calls[0][1] as { requestContext: { scope: string } };
    expect(options.requestContext).toEqual({ scope: 'market_report.compliance_review' });
    // The prompt carries the narration and the findings JSON.
    const prompt = (lexGenerate.mock.calls[0][0] as Array<{ content: string }>)[0].content;
    expect(prompt).toContain('MVRV crossed below 1.0.');
    expect(prompt).toContain('valuation_sensitive');
  });

  it('fails closed when the review errors', async () => {
    lexGenerate.mockRejectedValueOnce(new Error('model down'));
    const verdict = await reviewNarrationForCompliance({ narration: 'x', findings: FINDINGS });
    expect(verdict.passes).toBe(false);
    expect(verdict.rationale).toContain('withheld');
  });
});

describe('recordNarrationReview', () => {
  it('logs the verdict to agent_activity against the market_reports row', async () => {
    fakeSupabase.__setResponse('agent_activity', { data: null, error: null });
    await recordNarrationReview(
      { passes: false, flags: [{ quote: 'cheap', issue: 'valuation verdict' }], rationale: 'Framed as value.', suggested_rewrite: 'Neutral version.' },
      'mr-1',
    );
    const builder = fakeSupabase.__buildersFor('agent_activity')[0];
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_name: 'lex',
        action: 'Market report narration: withheld',
        status: 'auto',
        entity_type: 'market_reports',
        entity_id: 'mr-1',
        proposed_actions: [{ kind: 'suggested_rewrite', body: 'Neutral version.' }],
      }),
    );
  });
});
