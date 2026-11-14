// Classifiers for LLM provider errors. Kept duck-typed (no import of the AI SDK
// error class) so they can be exercised with plain objects in tests and stay
// resilient to the error not being an `APICallError` instance.

function asRecord(err: unknown): Record<string, unknown> | null {
  return typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : null;
}

/** Collects the human-readable text an error might carry the limit phrase in. */
function errorText(err: unknown): string {
  const rec = asRecord(err);
  if (!rec) return typeof err === 'string' ? err : '';
  const parts: string[] = [];
  if (typeof rec['message'] === 'string') parts.push(rec['message']);
  if (typeof rec['responseBody'] === 'string') parts.push(rec['responseBody']);
  return parts.join(' ');
}

/**
 * True when the error is an OpenRouter key/credit limit rejection — a 403 whose
 * body reads "Key limit exceeded". These are non-retryable: the key itself is
 * out of budget, so the only recovery is a different provider/key.
 */
export function isKeyLimitError(err: unknown): boolean {
  const rec = asRecord(err);
  if (!rec) return false;
  if (rec['statusCode'] !== 403) return false;
  return /key limit exceeded/i.test(errorText(err));
}

/**
 * True when the provider rejected the API key itself — a 401. OpenRouter
 * answers "User not found." when it can't map the key to an account (key
 * deleted, rotated, or an OpenRouter-side auth fault). Like a key limit, this
 * is non-retryable on the same key, so it is also a reason to fail over.
 */
export function isAuthError(err: unknown): boolean {
  return asRecord(err)?.['statusCode'] === 401;
}

/** Errors on which the OpenRouter key is unusable and another provider should be tried. */
export function shouldFailOverProvider(err: unknown): boolean {
  return isKeyLimitError(err) || isAuthError(err);
}
