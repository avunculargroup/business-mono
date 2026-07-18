import { describe, it, expect, vi, beforeEach } from 'vitest';

const verifierGenerate = vi.fn();

vi.mock('../agents/newsVerifier/index.js', () => ({ newsVerifier: { generate: verifierGenerate } }));
vi.mock('../config/model.js', () => ({ stepRequestContext: vi.fn(() => ({})) }));

const { verifyMoodSummary, buildVerifyPrompt } = await import('./newsCurationVerify.js');

const STORIES = [
  {
    title: 'ATO ends 50% CGT discount for individuals',
    source_name: 'AFR',
    key_points: ['The 50% CGT discount applies to individuals and sole traders', 'Change proposed from July 2027'],
    summary: 'A proposal targeting individual taxpayers.',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('verifyMoodSummary', () => {
  it('passes a faithful draft through unchanged', async () => {
    verifierGenerate.mockResolvedValue({ object: { faithful: true, corrected_summary: null } });

    const res = await verifyMoodSummary({ draft: 'Individuals face a CGT change.', stories: STORIES, neutralFallback: 'Curated 1 story.' });

    expect(res).toEqual({ summary: 'Individuals face a CGT change.', status: 'ok' });
  });

  it('swaps in the rewrite when the draft is unfaithful but fixable', async () => {
    verifierGenerate.mockResolvedValue({
      object: { faithful: false, corrected_summary: 'Australia proposes ending the 50% CGT discount for individuals from July 2027.' },
    });

    const res = await verifyMoodSummary({ draft: 'CFOs must reassess corporate holding periods.', stories: STORIES, neutralFallback: 'Curated 1 story.' });

    expect(res.status).toBe('revised');
    expect(res.summary).toBe('Australia proposes ending the 50% CGT discount for individuals from July 2027.');
  });

  it('falls back to the neutral line when unfaithful and unfixable', async () => {
    verifierGenerate.mockResolvedValue({ object: { faithful: false, corrected_summary: null } });

    const res = await verifyMoodSummary({ draft: 'Fabricated claim.', stories: STORIES, neutralFallback: 'Curated 3 stories.' });

    expect(res).toEqual({ summary: 'Curated 3 stories.', status: 'unverified' });
  });

  it('treats a blank rewrite as unfixable', async () => {
    verifierGenerate.mockResolvedValue({ object: { faithful: false, corrected_summary: '   ' } });

    const res = await verifyMoodSummary({ draft: 'Fabricated claim.', stories: STORIES, neutralFallback: 'Curated 2 stories.' });

    expect(res.status).toBe('unverified');
    expect(res.summary).toBe('Curated 2 stories.');
  });

  it('skips verification for an empty draft without calling the model', async () => {
    const res = await verifyMoodSummary({ draft: '   ', stories: STORIES, neutralFallback: 'Curated 1 story.' });

    expect(res).toEqual({ summary: '   ', status: 'skipped' });
    expect(verifierGenerate).not.toHaveBeenCalled();
  });

  it('skips verification when there are no stories to check against', async () => {
    const res = await verifyMoodSummary({ draft: 'Some intro.', stories: [], neutralFallback: 'Curated 0 stories.' });

    expect(res).toEqual({ summary: 'Some intro.', status: 'skipped' });
    expect(verifierGenerate).not.toHaveBeenCalled();
  });

  it('keeps the draft when the verifier throws (best-effort)', async () => {
    verifierGenerate.mockRejectedValue(new Error('model down'));

    const res = await verifyMoodSummary({ draft: 'Original intro.', stories: STORIES, neutralFallback: 'Curated 1 story.' });

    expect(res).toEqual({ summary: 'Original intro.', status: 'skipped' });
  });
});

describe('buildVerifyPrompt', () => {
  it('lists each story\'s key points as the facts to check against', () => {
    const prompt = buildVerifyPrompt('Draft intro.', STORIES);

    expect(prompt).toContain('Draft intro.');
    expect(prompt).toContain('ATO ends 50% CGT discount for individuals (AFR)');
    expect(prompt).toContain('The 50% CGT discount applies to individuals and sole traders');
  });

  it('falls back to the summary when a story has no key points', () => {
    const prompt = buildVerifyPrompt('Draft.', [
      { title: 'Podcast ep', source_name: 'Show', key_points: [], summary: 'A discussion about treasury policy.' },
    ]);

    expect(prompt).toContain('A discussion about treasury policy.');
  });
});
