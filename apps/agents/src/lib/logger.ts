import pino from 'pino';

/**
 * Structured logger for the agent server.
 *
 * Railway ingests logs line-by-line and flags anything on stderr as an error.
 * Raw `console.error(prefix, err)` therefore breaks in two ways: Node renders
 * an Error's stack across many lines (each becomes a separate Railway entry,
 * shredding the trace) and the whole thing lands on stderr (so warnings and
 * every stack line surface as errors).
 *
 * pino emits one single-line JSON object per event to stdout, with the level in
 * a `level` field Railway parses for severity, and the stack carried as an
 * escaped string inside `err` (embedded newlines stay *inside* the JSON string,
 * so it remains one physical line = one Railway entry).
 *
 * Usage:
 *   const log = createLogger('pm-listener');
 *   log.info({ rowId }, 'dispatch received');
 *   log.error({ err }, 'PM workflow error');   // full stack, one line
 */

const isProduction = process.env['NODE_ENV'] === 'production';

// Pretty-print only for an interactive local terminal. Railway (and the test
// runner) get plain single-line JSON, which is what their parsers expect —
// and it avoids spawning a pino-pretty worker thread under Vitest.
const usePretty = !isProduction && process.stdout.isTTY === true;

// Shared pino options (everything except the dev-only pretty transport). Exported
// so tests can build a logger over a capture stream with the exact same
// serializers/redaction/base as production.
export const loggerOptions: pino.LoggerOptions = {
  level: process.env['LOG_LEVEL'] ?? 'info',
  base: { service: 'bts-agents' },
  // Serialize Error objects (message + stack + cause) into a single JSON field.
  serializers: { err: pino.stdSerializers.err },
  // Realtime subscription errors and JMAP configs can carry apikeys/JWTs; keep
  // them out of the log stream. See listeners/lib/realtimeChannel.ts.
  redact: {
    paths: [
      'authorization',
      'apikey',
      'apiKey',
      'token',
      'access_token',
      'password',
      '*.authorization',
      '*.apikey',
      '*.token',
      'headers.authorization',
    ],
    censor: '[redacted]',
  },
};

export const logger = pino({
  ...loggerOptions,
  ...(usePretty
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
});

/**
 * Component-scoped child logger. The `component` field replaces the hand-written
 * `[tag]` prefixes that used to lead every console message.
 */
export function createLogger(component: string): pino.Logger {
  return logger.child({ component });
}

/**
 * Concise, single-line description of an error, for message-only call sites
 * that deliberately avoid dumping the raw object (e.g. Realtime CloseEvents
 * whose socket URL embeds credentials). Lifted from the former local helper in
 * listeners/lib/realtimeChannel.ts so the no-raw-error behaviour is shared.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}
