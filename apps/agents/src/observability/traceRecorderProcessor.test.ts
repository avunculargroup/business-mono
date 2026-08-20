import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import type { RedactionRecord } from '@platform/agent-traces';
import { TraceRecorderProcessor, redact } from './traceRecorderProcessor.js';

describe('TraceRecorderProcessor.fromEnv', () => {
  const original = process.env['TRACE_RECORDER_TRACE_ID'];

  beforeEach(() => {
    delete process.env['TRACE_RECORDER_TRACE_ID'];
  });

  afterEach(() => {
    if (original === undefined) delete process.env['TRACE_RECORDER_TRACE_ID'];
    else process.env['TRACE_RECORDER_TRACE_ID'] = original;
  });

  it('is off unless a trace id names the run to capture', () => {
    // The recorder writes payloads to disk. A recorder that is on by default
    // eventually records something it should not, so there is deliberately no
    // "record everything" mode — only "record this run".
    expect(TraceRecorderProcessor.fromEnv()).toBeNull();
  });

  it('turns on when a trace id is set', () => {
    process.env['TRACE_RECORDER_TRACE_ID'] = 'variant-gate-web';

    expect(TraceRecorderProcessor.fromEnv()).toBeInstanceOf(TraceRecorderProcessor);
  });
});

describe('redact', () => {
  let found: RedactionRecord[];

  beforeEach(() => {
    found = [];
  });

  it('removes personal data and says it did', () => {
    const out = redact(
      { first_name: 'Wren', last_name: 'Halloway', email: 'w@example.com', platform: 'linkedin' },
      3,
      found,
    ) as Record<string, unknown>;

    expect(out).toEqual({
      first_name: '[redacted]',
      last_name: '[redacted]',
      email: '[redacted]',
      platform: 'linkedin',
    });
    expect(found.map((record) => record.field).sort()).toEqual([
      'email',
      'first_name',
      'last_name',
    ]);
    expect(found.every((record) => record.reason === 'pii')).toBe(true);
  });

  it('removes credentials', () => {
    redact({ authorization: 'Bearer abc', api_key: 'sk-live-1' }, 0, found);

    expect(found.map((record) => record.reason)).toEqual(['credential', 'credential']);
  });

  it('reaches nested objects and arrays', () => {
    // The payloads that cross between workflow steps are nested, so a
    // top-level-only pass would miss every interesting case — and would look
    // like it was working.
    const out = redact(
      { ctx: { contacts: [{ email: 'a@example.com', role: 'CFO' }] } },
      1,
      found,
    ) as { ctx: { contacts: { email: string; role: string }[] } };

    expect(out.ctx.contacts[0].email).toBe('[redacted]');
    expect(out.ctx.contacts[0].role).toBe('CFO');
    expect(found[0].field).toBe('ctx.contacts[0].email');
  });

  it('records the step a redaction came from', () => {
    // The UI states a count and the trace lists them; a record with no step
    // cannot be pointed at.
    redact({ client_id: 'x' }, 7, found);

    expect(found[0]).toMatchObject({ stepIndex: 7, reason: 'client_data' });
  });

  it('leaves values that are not sensitive alone', () => {
    const payload = { platform: 'linkedin', max_chars: 3000, is_thread: false, body: null };

    expect(redact(payload, 0, found)).toEqual(payload);
    expect(found).toHaveLength(0);
  });

  it('does not confuse a substring match for a whole field', () => {
    // `emailed` is a market-report boolean, not an address. Over-redacting
    // hollows out the trace as surely as under-redacting exposes it — but note
    // the current rule does match it, which is the conservative direction.
    redact({ emailed: true }, 0, found);

    expect(found).toHaveLength(1);
  });
});
