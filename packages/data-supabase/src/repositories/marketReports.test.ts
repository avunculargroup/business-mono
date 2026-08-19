import { beforeEach, describe, expect, it } from 'vitest';
import {
  expectDescendingBy,
  expectPaginationContract,
  testReadContext,
} from '@platform/data/testing';
import type { Principal } from '@platform/data';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase';
import { createSupabaseRepositories } from '../bundle';
import type { PlatformSupabaseClient } from '../adapterContext';

const principal: Principal = { kind: 'team', userId: 'director-1' };
const ctx = testReadContext();

let client: FakeSupabaseClient;

function marketReports() {
  return createSupabaseRepositories(client as unknown as PlatformSupabaseClient, principal)
    .marketReports;
}

function reportRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mr-1',
    as_of: '2026-07-18',
    status: 'published',
    report_mode: 'normal',
    narration_markdown: 'Hash rate fell 8% overnight.',
    emailed: true,
    ...overrides,
  };
}

/** A finding as the engine writes it — snake_case, straight into the JSONB. */
function finding(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    finding_type: 'level_break',
    metric_key: 'hash_rate',
    metric_group: 'network',
    period: 'daily',
    as_of: '2026-07-18',
    window_days: 30,
    observed: -0.08,
    materiality: 0.72,
    compliance_class: 'neutral',
    direction: 'down',
    allowed_vocab: ['fell'],
    narration_hint: { means: 'Miners switched off.' },
    evidence_refs: [],
    ...overrides,
  };
}

beforeEach(() => {
  client = createFakeSupabase();
});

describe('listReports', () => {
  it('satisfies the pagination contract', async () => {
    client.__setRows('market_reports', [
      reportRow({ id: 'c', as_of: '2026-07-18' }),
      reportRow({ id: 'b', as_of: '2026-07-17' }),
      reportRow({ id: 'a', as_of: '2026-07-16' }),
    ]);

    await expectPaginationContract((readCtx, opts) => marketReports().listReports(readCtx, opts), {
      total: 3,
      ctx,
    });
  });

  it('orders newest first, in the query, and reads 30 by default', async () => {
    client.__setRows('market_reports', [
      reportRow({ id: 'c', as_of: '2026-07-18' }),
      reportRow({ id: 'b', as_of: '2026-07-17' }),
    ]);

    const page = await marketReports().listReports(ctx);

    expectDescendingBy(page.items, 'asOf');
    const builder = client.__buildersFor('market_reports')[0];
    expect(builder.order).toHaveBeenCalledWith('as_of', { ascending: false });
    expect(builder.range).toHaveBeenCalledWith(0, 29);
  });

  it('derives the quiet day from report_mode rather than exposing it', async () => {
    // The only question anything asks of `report_mode` is whether the day was
    // quiet — nothing cleared the materiality floor.
    client.__setRows('market_reports', [
      reportRow({ id: 'q', report_mode: 'quiet' }),
      reportRow({ id: 'n', report_mode: 'normal' }),
    ]);

    const { items } = await marketReports().listReports(ctx);

    expect(items.map((item) => item.isQuietDay)).toEqual([true, false]);
    expect(items[0]).not.toHaveProperty('reportMode');
  });

  it('does not fetch the findings blob for the list', async () => {
    // The list renders a date, an excerpt and two chips. Every report's full
    // findings audit trail is a lot of JSONB to pull for that.
    client.__setRows('market_reports', [reportRow()]);

    await marketReports().listReports(ctx);

    const [columns] = client.__buildersFor('market_reports')[0].select.mock.calls[0];
    expect(columns).not.toContain('findings');
    expect(columns).not.toContain('*');
  });
});

describe('getReport', () => {
  it('keeps the findings and the narration as separate fields', async () => {
    // This split is the surface's whole point: `findings` is the payload the
    // narrator was handed, `narrationMarkdown` is what it produced from that
    // and nothing else. `deterministic-before-llm` attaches to the boundary.
    client.__queueResponses('market_reports', [
      { data: { ...reportRow(), findings: [finding()] }, error: null },
    ]);
    client.__setResponse('market_report_feedback', { data: [], error: null });

    const report = await marketReports().getReport(ctx, 'mr-1');

    expect(report?.narrationMarkdown).toBe('Hash rate fell 8% overnight.');
    expect(report?.findings).toHaveLength(1);
    expect(report?.findings[0]).toMatchObject({
      // The engine's own shape, stored verbatim — the read model describes
      // what is stored rather than re-casing it.
      finding_type: 'level_break',
      metric_key: 'hash_rate',
      materiality: 0.72,
      narration_hint: { means: 'Miners switched off.' },
    });
  });

  it('carries the findings of a held report, whose narration was withheld', async () => {
    // A held day is the most informative one on this page: the deterministic
    // step ran and its output is here, and the narration was rejected.
    client.__setResponse('market_reports', {
      data: {
        ...reportRow({ status: 'held', narration_markdown: 'Rejected commentary.' }),
        findings: [finding()],
      },
      error: null,
    });
    client.__setResponse('market_report_feedback', { data: [], error: null });

    const report = await marketReports().getReport(ctx, 'mr-1');

    expect(report?.status).toBe('held');
    expect(report?.findings).toHaveLength(1);
  });

  it('reads a quiet day as no findings and no narration', async () => {
    client.__setResponse('market_reports', {
      data: { ...reportRow({ report_mode: 'quiet', narration_markdown: null }), findings: [] },
      error: null,
    });
    client.__setResponse('market_report_feedback', { data: [], error: null });

    const report = await marketReports().getReport(ctx, 'mr-1');

    expect(report).toMatchObject({ isQuietDay: true, narrationMarkdown: null, findings: [] });
  });

  it('treats a malformed findings blob as none rather than failing the page', async () => {
    // The page exists to show what the engine did; a bad audit row must not be
    // the thing that hides it.
    client.__setResponse('market_reports', {
      data: { ...reportRow(), findings: 'not an array' },
      error: null,
    });
    client.__setResponse('market_report_feedback', { data: [], error: null });

    expect((await marketReports().getReport(ctx, 'mr-1'))?.findings).toEqual([]);
  });

  it('returns prior feedback newest first', async () => {
    client.__setResponse('market_reports', { data: { ...reportRow(), findings: [] }, error: null });
    client.__setResponse('market_report_feedback', {
      data: [
        { id: 'f1', verdict: 'negative', feedback: 'Too confident.', created_at: '2026-07-19T00:00:00Z' },
      ],
      error: null,
    });

    const report = await marketReports().getReport(ctx, 'mr-1');

    expect(report?.priorFeedback).toEqual([
      { id: 'f1', verdict: 'negative', feedback: 'Too confident.', createdAt: '2026-07-19T00:00:00Z' },
    ]);
    expect(client.__buildersFor('market_report_feedback')[0].order).toHaveBeenCalledWith(
      'created_at',
      { ascending: false },
    );
  });

  it('is null for a report that is gone', async () => {
    client.__setResponse('market_reports', { data: null, error: null });

    expect(await marketReports().getReport(ctx, 'nope')).toBeNull();
  });
});

describe('addReportFeedback', () => {
  it('snapshots the narration and records the actor from the principal', async () => {
    client.__setResponse('market_reports', {
      data: { id: 'mr-1', narration_markdown: 'Hash rate fell 8% overnight.' },
      error: null,
    });
    client.__setResponse('market_report_feedback', { data: null, error: null });

    expect(await marketReports().addReportFeedback('mr-1', { feedback: '  Too confident.  ' })).toBe(
      true,
    );

    expect(client.__buildersFor('market_report_feedback')[0].insert).toHaveBeenCalledWith({
      market_report_id: 'mr-1',
      verdict: null,
      feedback: 'Too confident.',
      narration_excerpt: 'Hash rate fell 8% overnight.',
      created_by: 'director-1',
    });
  });

  it('caps the excerpt', async () => {
    client.__setResponse('market_reports', {
      data: { id: 'mr-1', narration_markdown: 'x'.repeat(900) },
      error: null,
    });
    client.__setResponse('market_report_feedback', { data: null, error: null });

    await marketReports().addReportFeedback('mr-1', { feedback: 'Note.' });

    const [row] = client.__buildersFor('market_report_feedback')[0].insert.mock.calls[0];
    expect(row.narration_excerpt).toHaveLength(500);
  });

  it('records feedback on a report that produced no narration at all', async () => {
    // An `error` day is worth commenting on, and has nothing to excerpt.
    client.__setResponse('market_reports', {
      data: { id: 'mr-1', narration_markdown: null },
      error: null,
    });
    client.__setResponse('market_report_feedback', { data: null, error: null });

    await marketReports().addReportFeedback('mr-1', { feedback: 'Why did this fail?' });

    expect(client.__buildersFor('market_report_feedback')[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ narration_excerpt: null }),
    );
  });

  it('reports false for a report that is gone', async () => {
    client.__setResponse('market_reports', { data: null, error: null });

    expect(await marketReports().addReportFeedback('nope', { feedback: 'Note.' })).toBe(false);
    expect(client.__buildersFor('market_report_feedback')).toHaveLength(0);
  });
});
