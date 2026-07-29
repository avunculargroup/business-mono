import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';

let fakeSupabase: FakeSupabaseClient;
vi.mock('@platform/db', () => ({
  get supabase() {
    return fakeSupabase;
  },
}));

const narrateMock = vi.fn();
const classifyMock = vi.fn();
vi.mock('./narrate.js', () => ({ narrateChange: (...args: unknown[]) => narrateMock(...args) }));
vi.mock('./classify.js', () => ({ classifyChange: (...args: unknown[]) => classifyMock(...args) }));

const { runEnrichment } = await import('./enrich.js');

const NOW = new Date('2026-07-29T00:00:00Z');

const unenriched = {
  id: 'ch1',
  change_type: 'release',
  title: 'firmware v6.3.4',
  payload: { new_version: '6.3.4' },
  occurred_at: '2026-07-28T00:00:00Z',
  entity_name: 'Coldcard',
  ecosystem_watches: { centrality: 1 },
};

beforeEach(() => {
  fakeSupabase = createFakeSupabase();
  narrateMock.mockReset();
  classifyMock.mockReset();
});

describe('runEnrichment', () => {
  it('writes the summary, score, band and compliance class on a clean pass', async () => {
    fakeSupabase.__setResponses('ecosystem_changes', [
      { data: [unenriched], error: null },
      { data: null, error: null },
    ]);
    narrateMock.mockResolvedValue('Coldcard released firmware 6.3.4.');
    classifyMock.mockResolvedValue({ complianceClass: 'neutral', complianceNotes: 'Product fact.' });

    const summary = await runEnrichment(NOW);

    expect(summary).toEqual({ enriched: 1, narrated: 1, classified: 1 });
    expect(fakeSupabase.__buildersFor('ecosystem_changes')[1].update).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: 'Coldcard released firmware 6.3.4.',
        compliance_class: 'neutral',
        compliance_notes: 'Product fact.',
        severity: expect.any(String),
        materiality: expect.any(Number),
      }),
    );
  });

  // The property the two-phase design exists for: facts never depend on the
  // model being up. A change with both LLM calls dead still gets its
  // deterministic score and band, and stays in the feed with its payload.
  it('still scores and bands a change when narration and classification both fail', async () => {
    fakeSupabase.__setResponses('ecosystem_changes', [
      { data: [unenriched], error: null },
      { data: null, error: null },
    ]);
    narrateMock.mockResolvedValue(null);
    classifyMock.mockResolvedValue(null);

    const summary = await runEnrichment(NOW);

    expect(summary).toEqual({ enriched: 1, narrated: 0, classified: 0 });
    const update = fakeSupabase.__buildersFor('ecosystem_changes')[1].update.mock.calls[0][0];
    expect(update).toHaveProperty('materiality');
    expect(update).toHaveProperty('severity');
    // Not written at all, rather than written as a guess — and NULL
    // compliance_class is what the promotion gate refuses.
    expect(update).not.toHaveProperty('summary');
    expect(update).not.toHaveProperty('compliance_class');
  });

  it('leaves the change for a later sweep when the write fails', async () => {
    fakeSupabase.__setResponses('ecosystem_changes', [
      { data: [unenriched], error: null },
      { data: null, error: { message: 'update failed' } },
    ]);
    narrateMock.mockResolvedValue('Coldcard released firmware 6.3.4.');
    classifyMock.mockResolvedValue({ complianceClass: 'neutral', complianceNotes: 'Fact.' });

    expect(await runEnrichment(NOW)).toEqual({ enriched: 0, narrated: 0, classified: 0 });
  });

  it('does nothing when there is nothing un-narrated', async () => {
    fakeSupabase.__setResponses('ecosystem_changes', [{ data: [], error: null }]);

    expect(await runEnrichment(NOW)).toEqual({ enriched: 0, narrated: 0, classified: 0 });
    expect(narrateMock).not.toHaveBeenCalled();
  });

  it('reports nothing enriched when the load fails, without throwing', async () => {
    fakeSupabase.__setResponses('ecosystem_changes', [{ data: null, error: { message: 'down' } }]);

    await expect(runEnrichment(NOW)).resolves.toEqual({ enriched: 0, narrated: 0, classified: 0 });
  });

  it('passes the watch weighting through to the score', async () => {
    fakeSupabase.__setResponses('ecosystem_changes', [
      { data: [{ ...unenriched, ecosystem_watches: { centrality: 2 } }], error: null },
      { data: null, error: null },
    ]);
    narrateMock.mockResolvedValue(null);
    classifyMock.mockResolvedValue(null);

    await runEnrichment(NOW);
    const weighted = fakeSupabase.__buildersFor('ecosystem_changes')[1].update.mock.calls[0][0];

    fakeSupabase = createFakeSupabase();
    fakeSupabase.__setResponses('ecosystem_changes', [
      { data: [unenriched], error: null },
      { data: null, error: null },
    ]);
    await runEnrichment(NOW);
    const plain = fakeSupabase.__buildersFor('ecosystem_changes')[1].update.mock.calls[0][0];

    expect(weighted.materiality).toBeGreaterThan(plain.materiality);
  });
});
