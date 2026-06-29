import { isKeyLimitError } from './llmErrors.js';

/**
 * The message Simon sends when he can't produce a real reply. Clearing the
 * typing indicator with nothing behind it reads as Simon ignoring the director;
 * a short, honest note tells them what happened and what to do. Spoken in
 * Simon's own first-person voice, matching the web error path
 * (listeners/webDirectives.ts) and the brand-voice microcopy rules (plain,
 * confident, no exclamation marks).
 */
export function simonFailureMessage(err: unknown, timedOut: boolean): string {
  if (timedOut) {
    return "That took longer than I could wait on, so I've stopped there. Send it again, or try rephrasing it.";
  }
  if (isKeyLimitError(err)) {
    return "I've hit a usage limit with the AI provider, so I can't reply right now. This needs a top-up before I'm back — I'm flagging it now.";
  }
  return "Something went wrong on my end and I couldn't finish that. Please send it again.";
}
