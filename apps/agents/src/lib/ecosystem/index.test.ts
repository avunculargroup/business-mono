import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';

let fakeSupabase: FakeSupabaseClient;
vi.mock('@platform/db', () => ({
  get supabase() {
    return fakeSupabase;
  },
}));

const runDetectionMock = vi.fn();
const runEnrichmentMock = vi.fn();
vi.mock('./detect.js', () => ({ runDetection: () => runDetectionMock() }));
vi.mock('./enrich.js', () => ({ runEnrichment: () => runEnrichmentMock() }));

const { runEcosystemScan } = await import('./index.js');

const cleanDetection = {
  watchesChecked: 2,
  watchesSkipped: 0,
  changesDetected: 1,
  failures: [],
};
const cleanEnrichment = { enriched: 1, narrated: 1, classified: 1 };

beforeEach(() => {
  fakeSupabase = createFakeSupabase();
  runDetectionMock.mockReset().mockResolvedValue(cleanDetection);
  runEnrichmentMock.mockReset().mockResolvedValue(cleanEnrichment);
});

describe('runEcosystemScan', () => {
  it('runs detection then enrichment and reports both', async () => {
    const result = await runEcosystemScan();

    expect(result).toEqual({ detection: cleanDetection, enrichment: cleanEnrichment });
  });

  it('logs the run under an agent name the activity CHECK actually admits', async () => {
    await runEcosystemScan();

    const insert = fakeSupabase.__buildersFor('agent_activity')[0].insert;
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        // 'rex' and the other roster personas are the only values
        // agent_activity_agent_name_check allows. An 'ecosystem' name here
        // would fail the insert at runtime, silently losing the run log.
        agent_name: 'rex',
        action: 'Ecosystem scan',
        status: 'auto',
        trigger_type: 'scheduled',
      }),
    );
  });

  it('records a run with any watch failure as an error so it surfaces without log spelunking', async () => {
    runDetectionMock.mockResolvedValue({
      ...cleanDetection,
      failures: [{ watchId: 'w1', label: 'Coldcard firmware', kind: 'not_found', message: 'HTTP 404' }],
    });

    await runEcosystemScan();

    const [[row]] = fakeSupabase.__buildersFor('agent_activity')[0].insert.mock.calls as [
      [Record<string, unknown>],
    ];
    expect(row.status).toBe('error');
    // Run stats are queryable out of notes, the convention the routine
    // handlers use.
    expect(JSON.parse(row.notes as string).detection.failures).toHaveLength(1);
  });

  it('still enriches when detection found nothing — a stalled narration is retried', async () => {
    runDetectionMock.mockResolvedValue({ ...cleanDetection, changesDetected: 0 });

    await runEcosystemScan();

    expect(runEnrichmentMock).toHaveBeenCalled();
  });

  it('returns an empty result rather than throwing when a phase blows up', async () => {
    runDetectionMock.mockRejectedValue(new Error('database unreachable'));

    const result = await runEcosystemScan();

    expect(result.detection.watchesChecked).toBe(0);
    expect(result.enrichment.enriched).toBe(0);
  });
});
