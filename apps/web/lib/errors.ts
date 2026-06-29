// Humane error messaging for the web app.
//
// Server actions talk to Supabase/Postgres, which surface terse, technical
// errors ("duplicate key value violates unique constraint companies_name_key",
// "new row violates row-level security policy"). Showing those verbatim leaves
// a director staring at jargon with no idea what to do next. `humanizeError`
// translates the failures we actually expect into plain, specific language and
// falls back to a calm generic message for everything else — never leaking the
// raw text.
//
// Tone follows docs/brand-voice.md → UI Microcopy Rules: plain, confident, no
// exclamation marks, helpful not cutesy, and specific about what to do next.

/** Best-effort extraction of the bits a thrown/returned error might carry. */
function readError(err: unknown): { code?: string; message: string; status?: number } {
  if (typeof err === 'string') return { message: err };
  if (err && typeof err === 'object') {
    const rec = err as Record<string, unknown>;
    return {
      code: typeof rec['code'] === 'string' ? rec['code'] : undefined,
      message: typeof rec['message'] === 'string' ? rec['message'] : '',
      status: typeof rec['status'] === 'number' ? rec['status'] : undefined,
    };
  }
  return { message: '' };
}

// A connectivity failure looks different across the stack: a thrown TypeError
// from fetch, a Supabase "TypeError: fetch failed" wrapper, or a raw socket
// error code. We treat them all as "couldn't reach the server".
function isNetworkError(code: string | undefined, message: string): boolean {
  if (code && ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
    return true;
  }
  return /fetch failed|failed to fetch|network ?error|networkerror|socket hang up|und_err/i.test(message);
}

const GENERIC = "Something went wrong on our end and the change didn't go through. Please try again.";

/**
 * Translate any caught/returned error into a humane, user-facing message.
 *
 * Recognised cases get a specific, actionable sentence. Anything we don't
 * recognise returns a calm generic message AND is logged (raw) server-side so
 * the founders can still diagnose it — humane to the user, full detail in the
 * logs.
 */
export function humanizeError(err: unknown, fallback: string = GENERIC): string {
  const { code, message, status } = readError(err);

  if (isNetworkError(code, message)) {
    return "We couldn't reach the server just now. Check your connection and try again in a moment.";
  }

  // Postgres SQLSTATE codes (surfaced by PostgREST as `code`).
  switch (code) {
    case '23505': // unique_violation
      return 'Something with these details already exists. Try a different value.';
    case '23503': // foreign_key_violation
      return "This is still linked to other records, so it can't be changed or removed yet. Remove those links first.";
    case '23502': // not_null_violation
      return 'A required field is missing. Fill it in and try again.';
    case '23514': // check_violation
      return "One of the values isn't allowed here. Double-check it and try again.";
    case '23P01': // exclusion_violation
      return 'That conflicts with an existing record. Adjust it and try again.';
    case '22P02': // invalid_text_representation (bad UUID/number)
      return "One of the values isn't in the format we expected. Double-check it and try again.";
    case '42501': // insufficient_privilege (RLS / grants)
    case 'PGRST301':
      return "You don't have permission to do that.";
    case 'PGRST116': // no rows where exactly one expected
      return "We couldn't find that record. It may have already been removed.";
    default:
      break;
  }

  // Row-level-security denials sometimes arrive without the 42501 code.
  if (/row-level security|permission denied|not authorized|unauthorized/i.test(message) || status === 401 || status === 403) {
    return "You don't have permission to do that.";
  }

  // Supabase Auth errors carry readable messages but in inconsistent casing.
  if (/invalid login credentials/i.test(message)) {
    return "That email or password doesn't match our records.";
  }
  if (/email not confirmed/i.test(message)) {
    return 'Confirm your email address before signing in. Check your inbox for the link.';
  }
  if (/rate limit|too many requests/i.test(message) || status === 429) {
    return "You've tried that a few too many times. Wait a moment and try again.";
  }

  // Unrecognised: keep the user calm, keep the detail in the logs.
  if (process.env.NODE_ENV !== 'test') {
    console.error('[humanizeError] unmapped error:', err);
  }
  return fallback;
}

/**
 * Convenience for server actions: turn any error into the `{ error }` shape
 * actions return, with a humane message. Use in catch blocks so an unexpected
 * throw (network blip, bug) becomes a friendly message instead of bubbling up
 * to a generic crash screen.
 */
export function actionError(err: unknown, fallback?: string): { error: string } {
  return { error: humanizeError(err, fallback) };
}
