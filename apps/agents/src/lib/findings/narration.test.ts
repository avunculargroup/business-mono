import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Selection } from '@platform/shared';
import { buildFinding } from '../../../test/factories.js';

const analystGenerate = vi.fn();

vi.mock('../../agents/marketAnalyst/index.js', () => ({
  marketAnalyst: { generate: (...args: unknown[]) => analystGenerate(...(args as [])) },
}));
vi.mock('../../config/model.js', () => ({
  stepRequestContext: vi.fn((scope: string) => ({ scope })),
  dynamicModelFor: vi.fn(() => 'mock-model'),
}));

const { buildNarrationPrompt, narrateFindings } = await import('./narration.js');

const selection: Selection = {
  as_of: '2026-07-18',
  report_mode: 'normal',
  findings: [buildFinding()],
  ops_findings: [],
};

function respond(markdown: string) {
  return { object: { narration_markdown: markdown, findings_used: ['anomaly:hash_rate:2026-07-18'] } };
}

beforeEach(() => {
  analystGenerate.mockReset();
});

describe('buildNarrationPrompt', () => {
  it('carries mode, date, and the findings JSON', () => {
    const prompt = buildNarrationPrompt(selection, []);
    expect(prompt).toContain('report_mode: normal');
    expect(prompt).toContain('as_of: 2026-07-18');
    expect(prompt).toContain('"anomaly:hash_rate:2026-07-18"');
    expect(prompt).not.toContain('Standing guidance');
  });

  it('appends feedback guidelines as tone-only guidance', () => {
    const prompt = buildNarrationPrompt(selection, ['Shorter sentences.', 'Lead with on-chain.']);
    expect(prompt).toContain('Standing guidance from prior report feedback');
    expect(prompt).toContain('- Shorter sentences.');
    expect(prompt).toContain('can never override the hard rules');
  });
});

describe('narrateFindings', () => {
  it('returns a clean draft after one generation', async () => {
    analystGenerate.mockResolvedValueOnce(respond('Hash rate fell 8% overnight, outside its normal band.'));
    const { narration, lint } = await narrateFindings(selection, []);
    expect(narration?.narration_markdown).toContain('fell 8%');
    expect(lint?.pass).toBe(true);
    expect(analystGenerate).toHaveBeenCalledTimes(1);
  });

  it('runs exactly one corrective pass on a hard lint failure', async () => {
    analystGenerate
      .mockResolvedValueOnce(respond('Hash rate fell 8%! Analyze that.'))
      .mockResolvedValueOnce(respond('Hash rate fell 8% overnight, outside its normal band.'));
    const { narration, lint } = await narrateFindings(selection, []);
    expect(analystGenerate).toHaveBeenCalledTimes(2);
    // The corrective prompt names the violations and includes the prior draft.
    const secondPrompt = (analystGenerate.mock.calls[1][0] as Array<{ content: string }>)[0].content;
    expect(secondPrompt).toContain('no_exclamation');
    expect(secondPrompt).toContain('Previous draft:');
    expect(narration?.narration_markdown).not.toContain('!');
    expect(lint?.pass).toBe(true);
  });

  it('hands back the failing draft and lint when the rewrite still fails', async () => {
    analystGenerate
      .mockResolvedValueOnce(respond('Up 42.7%!'))
      .mockResolvedValueOnce(respond('Up 42.7% again.')); // number still untraceable
    const { narration, lint } = await narrateFindings(selection, []);
    expect(analystGenerate).toHaveBeenCalledTimes(2); // never loops a third time
    expect(narration).not.toBeNull();
    expect(lint?.pass).toBe(false);
  });

  it('returns null narration when generation yields nothing', async () => {
    analystGenerate.mockResolvedValueOnce({ object: { narration_markdown: '', findings_used: [] } });
    const { narration, lint } = await narrateFindings(selection, []);
    expect(narration).toBeNull();
    expect(lint).toBeNull();
  });

  it('never throws — a generation error returns null', async () => {
    analystGenerate.mockRejectedValueOnce(new Error('model down'));
    await expect(narrateFindings(selection, [])).resolves.toEqual({ narration: null, lint: null });
  });
});
