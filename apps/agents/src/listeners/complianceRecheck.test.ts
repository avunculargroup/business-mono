import { describe, it, expect, vi } from 'vitest';

// The module imports @platform/db (supabase + createRealtimeClient) at load. Stub
// both so importing the pure mappers doesn't require a live client.
vi.mock('@platform/db', () => ({
  createRealtimeClient: () => ({}),
  supabase: {},
}));

const { draftFromRow, buildComplianceFields, patchGateStatePreview } = await import('./complianceRecheck.js');
import type { LexVerdict } from '../workflows/variant/schemas.js';

const verdict: LexVerdict = {
  classification: 'general_advice',
  needs_disclaimer: true,
  disclaimer_key: 'general_advice_warning',
  rationale: 'Touches allocation.',
};
const snippets = [
  { id: 'snip-1', key: 'general_advice_warning' },
  { id: 'snip-2', key: 'no_personal_advice' },
];

describe('draftFromRow', () => {
  it('builds a single-post draft', () => {
    const draft = draftFromRow(
      { id: 'ci', campaign_id: 'c', is_thread: false, title: 'T', body: 'A post.', compliance_status: 'pending', gate_state: null },
      [],
    );
    expect(draft).toMatchObject({ is_thread: false, body: 'A post.', segments: [] });
  });

  it('builds a thread draft from segment bodies', () => {
    const draft = draftFromRow(
      { id: 'ci', campaign_id: 'c', is_thread: true, title: '', body: 'lead', compliance_status: 'pending', gate_state: null },
      ['one', 'two'],
    );
    expect(draft.is_thread).toBe(true);
    expect(draft.segments).toEqual([{ body: 'one' }, { body: 'two' }]);
  });

  it('is not a thread when flagged but segments are missing', () => {
    const draft = draftFromRow(
      { id: 'ci', campaign_id: 'c', is_thread: true, title: '', body: 'x', compliance_status: 'pending', gate_state: null },
      [],
    );
    expect(draft.is_thread).toBe(false);
  });
});

describe('buildComplianceFields', () => {
  it('maps a cleared general-advice verdict with a disclaimer id', () => {
    const fields = buildComplianceFields(verdict, snippets, '2026-06-23T00:00:00Z');
    expect(fields).toEqual({
      compliance_status: 'cleared',
      compliance_classification: 'general_advice',
      needs_disclaimer: true,
      disclaimer_snippet_id: 'snip-1',
      compliance_rationale: 'Touches allocation.',
      compliance_checked_at: '2026-06-23T00:00:00Z',
    });
  });

  it('flags a personal_opinion verdict and drops the disclaimer', () => {
    const fields = buildComplianceFields(
      { ...verdict, classification: 'personal_opinion', needs_disclaimer: false, disclaimer_key: null },
      snippets,
      '2026-06-23T00:00:00Z',
    );
    expect(fields.compliance_status).toBe('flagged');
    expect(fields.disclaimer_snippet_id).toBeNull();
  });
});

describe('patchGateStatePreview', () => {
  it('returns null when the row is not suspended at a gate', () => {
    const draft = draftFromRow(
      { id: 'ci', campaign_id: 'c', is_thread: false, title: '', body: 'x', compliance_status: 'pending', gate_state: null },
      [],
    );
    expect(patchGateStatePreview(null, draft, verdict)).toBeNull();
  });

  it('patches the preview copy, char count, and compliance chip', () => {
    const draft = draftFromRow(
      { id: 'ci', campaign_id: 'c', is_thread: false, title: 'T', body: 'Edited copy.', compliance_status: 'pending', gate_state: {} },
      [],
    );
    const gateState = { gate: 'gate3', contentItemId: 'ci', preview: { body: 'old', charCount: 3, classification: 'educational', needsDisclaimer: false } };
    const patched = patchGateStatePreview(gateState, draft, verdict) as {
      preview: { body: string; charCount: number; classification: string; needsDisclaimer: boolean; disclaimerKey: string | null };
    };
    expect(patched.preview.body).toBe('Edited copy.');
    expect(patched.preview.charCount).toBe('Edited copy.'.length);
    expect(patched.preview.classification).toBe('general_advice');
    expect(patched.preview.needsDisclaimer).toBe(true);
    expect(patched.preview.disclaimerKey).toBe('general_advice_warning');
  });
});
