import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';
import pino from 'pino';
import { createLogger, describeError, loggerOptions } from './logger.js';

// Build a logger over a capture stream using the exact production options, so
// assertions exercise the real serializers / redaction / base config.
function captureLogger(): { log: pino.Logger; lines: () => string[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(String(chunk));
      cb();
    },
  });
  const log = pino({ ...loggerOptions, level: 'debug' }, stream);
  return { log, lines: () => chunks.join('').split('\n').filter(Boolean) };
}

describe('logger', () => {
  it('emits exactly one line of valid JSON per event', () => {
    const { log, lines } = captureLogger();
    log.info({ rowId: 42 }, 'dispatch received');
    log.warn('heads up');

    const out = lines();
    expect(out).toHaveLength(2);
    for (const line of out) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    const first = JSON.parse(out[0]);
    expect(first).toMatchObject({ rowId: 42, msg: 'dispatch received', service: 'bts-agents' });
  });

  it('serializes an Error stack into a single JSON line (no raw newlines)', () => {
    const { log, lines } = captureLogger();
    log.error({ err: new Error('boom') }, 'PM workflow error');

    const out = lines();
    // A multi-line stack that leaked past JSON escaping would split into >1 line.
    expect(out).toHaveLength(1);
    const rec = JSON.parse(out[0]);
    expect(rec.level).toBe(50);
    expect(rec.msg).toBe('PM workflow error');
    expect(rec.err.message).toBe('boom');
    expect(rec.err.stack).toContain('Error: boom');
    // The stack's newlines survive as escaped characters inside the JSON string.
    expect(rec.err.stack).toContain('\n');
  });

  it('redacts sensitive fields (top-level and nested)', () => {
    const { log, lines } = captureLogger();
    log.info({ authorization: 'Bearer secret', nested: { token: 'abc' } }, 'redaction check');

    const rec = JSON.parse(lines()[0]);
    expect(rec.authorization).toBe('[redacted]');
    expect(rec.nested.token).toBe('[redacted]');
  });

  it('createLogger binds the component (former [tag] prefix)', () => {
    const log = createLogger('pm-listener');
    expect(log.bindings()).toMatchObject({ service: 'bts-agents', component: 'pm-listener' });
  });
});

describe('describeError', () => {
  it('returns the message for an Error without the stack', () => {
    expect(describeError(new Error('socket closed: 1006'))).toBe('socket closed: 1006');
  });

  it('passes strings through and stringifies anything else', () => {
    expect(describeError('plain')).toBe('plain');
    expect(describeError(1006)).toBe('1006');
  });
});
