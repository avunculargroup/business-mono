import { createRealtimeClient } from '@platform/db';
import { simon } from '../agents/simon/index.js';
import { subscribeWithReconnect } from './lib/realtimeChannel.js';
import type { ConvMessage, ConvRow } from './types.js';

const supabase = createRealtimeClient();

// Bound the top-level simon.generate() call so a hung model or runaway tool
// chain cannot leave the web UI on a forever-typing indicator. Mastra forwards
// abortSignal into subagent invocations, so this also cancels any in-flight
// specialist call.
const SIMON_TIMEOUT_MS = 240_000;

// Subagent tool name prefix produced by Mastra's native delegation pattern
// (see `agents: {...}` on the Simon Agent). Replaces the prior `delegate_to_`
// prefix used by the hand-rolled delegate tools.
const SUBAGENT_TOOL_PREFIX = 'agent-';

// Injected as a non-persisted `context` system message on the auto-retry when
// Simon narrates delegation (or promises a retry) but never actually invokes a
// subagent. `context`-source messages are NOT written to thread memory (Mastra
// only persists input/response messages), so this nudge steers the retry
// without leaving an artificial system turn in the director's history.
const DELEGATION_RETRY_NUDGE =
  'Your previous reply described handing this to a specialist or promised to retry, but you never invoked the matching agent-<name> subagent tool. Mentioning a specialist is not delegation. Invoke the correct subagent tool now to actually dispatch the work — do not narrate it, and do not query content_items or agent_activity first, just call the tool.';

export type SimonToolResult = {
  toolName?: string;
  result?: unknown;
  isError?: boolean;
};

export type SimonGenerateResult = {
  text: string;
  toolCalls?: Array<{ toolName?: string }>;
  toolResults?: SimonToolResult[];
};

export type DelegationAnalysis = {
  /** A subagent (agent-*) tool was actually invoked this turn. */
  delegated: boolean;
  /** Simon's text claims he delegated to / handed off to a specialist. */
  claimsDelegation: boolean;
  /** Simon promised a retry but made no follow-up subagent call. */
  emptyRetryPromise: boolean;
  /** A subagent invocation errored but Simon's text claims success/progress. */
  silentFailure: boolean;
  /** The erroring subagent tool result backing `silentFailure`, if any. */
  failedDelegate?: SimonToolResult;
};

/**
 * Inspect a Simon generation for the known "claimed but didn't actually
 * delegate" failure modes. Pure and side-effect free so it can be unit-tested
 * and reused across the initial call and the auto-retry.
 */
export function analyzeDelegation(result: SimonGenerateResult): DelegationAnalysis {
  const toolCalls = result.toolCalls ?? [];
  const delegated = toolCalls.some((c) => c.toolName?.startsWith(SUBAGENT_TOOL_PREFIX));

  const claimsDelegation =
    /\bdelegat|hand(ed|ing) (this )?(off|over) to|asked? \w+ to (draft|research|check|find|look)/i.test(
      result.text,
    );

  // Catch the "let me try again" failure mode where Simon reports a specialist
  // timeout, promises to retry, and then ends the turn without making another
  // subagent call. The director would otherwise sit waiting on a retry that
  // will never come.
  const lastDelegateIdx = (() => {
    for (let i = toolCalls.length - 1; i >= 0; i -= 1) {
      if (toolCalls[i]?.toolName?.startsWith(SUBAGENT_TOOL_PREFIX)) return i;
    }
    return -1;
  })();
  const promisesRetry =
    /\b(let me|i(?:'ll| will| am going to)?)\s+(try|retry|run|do|ask)\s+(?:that|this|him|her|them|it|again|once more)\b|\b(retrying|trying)\s+(?:again|once more|now)\b/i.test(
      result.text,
    );
  // A retry promise is empty if Simon didn't issue any subagent call after
  // making the promise — approximated here as: no subagent call exists, or
  // the last subagent call was the failed one Simon is now apologising for.
  // We can't precisely correlate text position to tool-call order, but if
  // the model promises a retry and the turn ends with a single subagent
  // call, that's almost always the empty-promise case.
  const emptyRetryPromise = promisesRetry && lastDelegateIdx <= 0;

  // Catch the "specialist failed but Simon claims success" failure mode:
  // a subagent invocation returned an error (e.g. via onDelegationComplete's
  // capacity-gap path), and Simon then told the director "Done — Charlie's
  // working on it" without acknowledging the failure. Without this guard
  // the director thinks a draft is on its way and waits indefinitely.
  // Mastra surfaces tool-execution errors via toolResults entries with
  // isError=true (or, for older shapes, by stringifying the thrown error
  // into result), so we check both.
  const toolResults = result.toolResults ?? [];
  const failedDelegate = toolResults.find((r) => {
    if (!r.toolName?.startsWith(SUBAGENT_TOOL_PREFIX)) return false;
    if (r.isError === true) return true;
    const raw =
      typeof r.result === 'string'
        ? r.result
        : r.result && typeof r.result === 'object'
          ? JSON.stringify(r.result)
          : '';
    return /\b(timed out|timeout|specialist .* (timed out|failed|errored))\b/i.test(raw);
  });
  const acknowledgesFailure =
    /\b(timed out|timeout|failed|couldn'?t|wasn'?t able|stalled|errored|issue|trouble|problem|sorry)\b/i.test(
      result.text,
    );
  const claimsSuccessOrInProgress =
    /\b(done|drafted|created|wrote|posted|sent|completed|all set|here'?s|here you go|ready (?:shortly|soon|now|in a moment)|will (?:be|have it) ready|working on (?:it|that|a|the)|(?:just )?(?:finished|wrapped up)|(?:still )?processing|give (?:him|her|them) (?:another|a)? ?moment|almost (?:done|ready)|should be ready|in progress)\b/i.test(
      result.text,
    );
  const silentFailure = !!failedDelegate && !acknowledgesFailure && claimsSuccessOrInProgress;

  return { delegated, claimsDelegation, emptyRetryPromise, silentFailure, failedDelegate };
}

/**
 * True when Simon's reply signals delegation/retry intent but no subagent was
 * actually invoked — the case an auto-retry can recover from.
 */
export function needsDelegationRetry(analysis: DelegationAnalysis): boolean {
  return (analysis.claimsDelegation && !analysis.delegated) || analysis.emptyRetryPromise;
}

/**
 * Build the director-facing reply, appending a loud `[system: ...]` note when
 * Simon's turn still exhibits a known failure mode after any auto-retry. Pure
 * so the wording is unit-testable.
 */
export function buildFlaggedReply(result: SimonGenerateResult, analysis: DelegationAnalysis): string {
  if (analysis.claimsDelegation && !analysis.delegated) {
    console.warn(
      '[web-directives] Simon claimed delegation but made no agent-* subagent call:',
      result.text.slice(0, 200),
    );
    return `${result.text}\n\n[system: I named a specialist but didn't actually invoke one — please retry, or rephrase the directive.]`;
  }
  if (analysis.silentFailure && analysis.failedDelegate) {
    const failedDelegate = analysis.failedDelegate;
    const errStr = ((): string => {
      const r = failedDelegate.result;
      if (typeof r === 'string') return r;
      if (r instanceof Error) return r.message;
      if (r && typeof r === 'object') {
        const obj = r as { message?: unknown; error?: unknown };
        if (typeof obj.message === 'string') return obj.message;
        if (typeof obj.error === 'string') return obj.error;
        return JSON.stringify(r).slice(0, 240);
      }
      return `${failedDelegate.toolName} failed`;
    })();
    console.warn('[web-directives] Simon claimed success but delegate tool errored:', {
      toolName: failedDelegate.toolName,
      error: errStr,
      replyPrefix: result.text.slice(0, 200),
    });
    return `${result.text}\n\n[system: ${failedDelegate.toolName} actually returned an error: ${errStr}. Please resend the directive — a shorter prompt sometimes helps.]`;
  }
  if (analysis.emptyRetryPromise) {
    console.warn(
      '[web-directives] Simon promised a retry but made no follow-up agent-* subagent call:',
      result.text.slice(0, 200),
    );
    return `${result.text}\n\n[system: Simon promised a retry but didn't actually run one. Please resend the directive — a shorter prompt sometimes helps.]`;
  }
  return result.text;
}

type DirectiveGenerate = (
  message: string,
  opts: {
    memory: { resource: string; thread: string };
    abortSignal: AbortSignal;
    context?: Array<{ role: 'system'; content: string }>;
  },
) => Promise<SimonGenerateResult>;

/**
 * Run a directive through Simon, and if he narrates delegation (or promises a
 * retry) without actually invoking a subagent, re-run it ONCE with a
 * non-persisted nudge instructing him to call the tool. Returns the final
 * result and its analysis so the caller can build the reply. Both calls share
 * the same abort signal, so the auto-retry stays inside the overall deadline.
 */
export async function runDirectiveWithRetry(
  generate: DirectiveGenerate,
  directive: string,
  ctx: { resource: string; thread: string; signal: AbortSignal },
): Promise<{ result: SimonGenerateResult; analysis: DelegationAnalysis; retried: boolean }> {
  const memory = { resource: ctx.resource, thread: ctx.thread };
  let result = await generate(directive, { memory, abortSignal: ctx.signal });
  let analysis = analyzeDelegation(result);

  const retried = needsDelegationRetry(analysis);
  if (retried) {
    console.warn(
      '[web-directives] Simon narrated delegation without invoking a subagent — auto-retrying once',
    );
    result = await generate(directive, {
      memory,
      abortSignal: ctx.signal,
      context: [{ role: 'system', content: DELEGATION_RETRY_NUDGE }],
    });
    analysis = analyzeDelegation(result);
  }

  return { result, analysis, retried };
}

/**
 * Subscribes to agent_conversations via Supabase Realtime.
 * When a new user message arrives on the web thread, Simon processes it
 * and writes the response back — no HTTP call between services needed.
 */
export async function startWebDirectivesListener(): Promise<void> {
  // Clear any is_processing flag left by a previous crash so the web UI
  // isn't permanently stuck showing a typing indicator on restart.
  // Must await: the supabase-js query builder is a thenable that only fires
  // the HTTP request when then() is called — discarding it with `void` is a no-op.
  const { error: cleanupError } = await supabase
    .from('agent_conversations')
    .update({ is_processing: false } as never)
    .eq('signal_chat_id', 'web')
    .eq('is_processing', true as never);
  if (cleanupError) {
    console.error('[web-directives] Failed to clear stuck is_processing flag:', cleanupError);
  }

  subscribeWithReconnect({
    client: supabase,
    channelName: 'web-directives',
    logPrefix: '[web-directives]',
    onSubscribed: () => {
      console.log('[web-directives] Listening for web directives via Supabase Realtime');
    },
    attachHandlers: (channel) => channel.on(
      'postgres_changes' as never,
      { event: '*', schema: 'public', table: 'agent_conversations' },
      async (payload: { eventType: string; new: ConvRow }) => {
        try {
          console.log('[web-directives] Received event:', payload.eventType);
          if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return;

          const conv = payload.new;
          if (conv.signal_chat_id !== 'web') return;
          if (conv.is_processing) return; // Prevents re-triggering from our own is_processing=true write
          console.log('[web-directives] Processing web conversation:', conv.id);

          const messages: ConvMessage[] = Array.isArray(conv.messages) ? conv.messages : [];
          const lastMessage = messages[messages.length - 1];

          // Only process when the latest message is from the director (user)
          if (!lastMessage || lastMessage.role !== 'user') return;

          // Signal to the web client that Simon is thinking
          await supabase
            .from('agent_conversations')
            .update({ is_processing: true } as never)
            .eq('id', conv.id);

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), SIMON_TIMEOUT_MS);
          try {
            // Generate Simon's response via Mastra Memory. The abortSignal also
            // propagates into in-flight specialist tool calls. runDirectiveWithRetry
            // auto-recovers the "narrated delegation but didn't actually invoke a
            // subagent" failure mode by re-running Simon once with a nudge before we
            // give up and surface a [system: ...] note to the director.
            const { result, analysis } = await runDirectiveWithRetry(
              async (message, opts) => (await simon.generate(message, opts)) as SimonGenerateResult,
              lastMessage.content,
              { resource: 'web-director', thread: conv.id, signal: controller.signal },
            );

            const replyText = buildFlaggedReply(result, analysis);

            const simonMessage: ConvMessage = {
              role: 'assistant',
              content: replyText,
              timestamp: new Date().toISOString(),
              source: 'simon',
            };

            // Dual-write: write response to agent_conversations and clear processing flag
            await supabase
              .from('agent_conversations')
              .update({ messages: [...messages, simonMessage], is_processing: false } as never)
              .eq('id', conv.id);

            await supabase.from('agent_activity').insert({
              agent_name: 'simon',
              action: `Web directive: ${lastMessage.content.slice(0, 120)}`,
              status: 'auto',
              trigger_type: 'manual',
              workflow_run_id: null,
              entity_type: null,
              entity_id: null,
              proposed_actions: null,
              approved_actions: null,
              clarifications: null,
              notes: null,
            });
          } catch (err) {
            console.error('[web-directives] Simon processing error:', err);
            // Surface the failure to the director — clearing the typing indicator
            // without a message just looks like Simon ignored them.
            const isTimeout = controller.signal.aborted;
            const errorContent = isTimeout
              ? `That took longer than I'm willing to wait. Try again, or rephrase the directive.`
              : `Something went wrong on my end and I couldn't finish that. Please try again.`;
            const errorMessage: ConvMessage = {
              role: 'assistant',
              content: errorContent,
              timestamp: new Date().toISOString(),
              source: 'simon',
            };
            // Re-fetch messages so we don't clobber anything appended in the meantime.
            const { data: latest } = await supabase
              .from('agent_conversations')
              .select('messages')
              .eq('id', conv.id)
              .maybeSingle();
            const currentMessages: ConvMessage[] = Array.isArray(latest?.messages)
              ? (latest.messages as ConvMessage[])
              : messages;
            await supabase
              .from('agent_conversations')
              .update({
                messages: [...currentMessages, errorMessage],
                is_processing: false,
              } as never)
              .eq('id', conv.id);
          } finally {
            clearTimeout(timer);
          }
        } catch (err) {
          console.error('[web-directives] Unhandled error in event handler:', err);
        }
      }
    ),
  });
}
