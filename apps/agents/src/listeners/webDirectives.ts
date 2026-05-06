import { createRealtimeClient } from '@platform/db';

const supabase = createRealtimeClient();
import { simon } from '../agents/simon/index.js';
import type { ConvMessage, ConvRow } from './types.js';

// Module-level state so reconnect logic is properly deduped across calls
let currentChannel: ReturnType<typeof supabase.channel> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let hasEverSubscribed = false;

// Bound the top-level simon.generate() call so a hung model or runaway tool
// chain cannot leave the web UI on a forever-typing indicator. Set above the
// 180s per-specialist ceiling in tools.ts so a single legitimate specialist
// call doesn't trip this outer timeout. Mastra forwards abortSignal into
// tool executions, so this also cancels any in-flight specialist call.
const SIMON_TIMEOUT_MS = 240_000;

function scheduleReconnect(reason?: string): void {
  if (reconnectTimer !== null) return;
  reconnectAttempt += 1;
  const delay = Math.min(5000 * Math.pow(2, reconnectAttempt - 1), 60000);
  const scenario = hasEverSubscribed ? 'connection lost' : 'never connected';
  console.log(
    `[web-directives] ${scenario} — reconnect attempt ${reconnectAttempt} in ${delay / 1000}s` +
    (reason ? ` (${reason})` : '')
  );
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void startWebDirectivesListener();
  }, delay);
}

/**
 * Subscribes to agent_conversations via Supabase Realtime.
 * When a new user message arrives on the web thread, Simon processes it
 * and writes the response back — no HTTP call between services needed.
 */
export async function startWebDirectivesListener(): Promise<void> {
  // Cancel any pending reconnect
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

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

  // Clean up existing channel before creating a new one
  if (currentChannel !== null) {
    void supabase.removeChannel(currentChannel);
  }

  const channel = supabase
    .channel('web-directives')
    .on(
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
            // Generate Simon's response via Mastra Memory. The abortSignal
            // also propagates into in-flight specialist tool calls.
            const result = (await simon.generate(lastMessage.content, {
              memory: {
                resource: 'web-director',
                thread: conv.id,
              },
              abortSignal: controller.signal,
            })) as {
              text: string;
              toolCalls?: Array<{ toolName?: string }>;
              toolResults?: Array<{
                toolName?: string;
                result?: unknown;
                isError?: boolean;
              }>;
            };

            // Guard against the "Simon claimed delegation but didn't actually invoke a
            // specialist" failure mode. Make it loud rather than silent so directors
            // see something is wrong instead of waiting on a draft that will never come.
            const toolCalls = result.toolCalls ?? [];
            const delegated = toolCalls.some((c) => c.toolName?.startsWith('delegate_to_'));
            const claimsDelegation =
              /\bdelegat|hand(ed|ing) (this )?(off|over) to|asked? \w+ to (draft|research|check|find|look)/i.test(
                result.text,
              );
            // Catch the "let me try again" failure mode where Simon reports a specialist
            // timeout, promises to retry, and then ends the turn without making another
            // delegate_to_* call. The director would otherwise sit waiting on a retry
            // that will never come.
            const lastDelegateIdx = (() => {
              for (let i = toolCalls.length - 1; i >= 0; i -= 1) {
                if (toolCalls[i]?.toolName?.startsWith('delegate_to_')) return i;
              }
              return -1;
            })();
            const promisesRetry =
              /\b(let me|i(?:'ll| will| am going to)?)\s+(try|retry|run|do|ask)\s+(?:that|this|him|her|them|it|again|once more)\b|\b(retrying|trying)\s+(?:again|once more|now)\b/i.test(
                result.text,
              );
            // A retry promise is empty if Simon didn't issue any delegate call after
            // making the promise — approximated here as: no delegate call exists, or
            // the last delegate call was the failed one Simon is now apologising for.
            // We can't precisely correlate text position to tool-call order, but if
            // the model promises a retry and the turn ends with a single delegate
            // call, that's almost always the empty-promise case.
            const emptyRetryPromise = promisesRetry && lastDelegateIdx <= 0;

            // Catch the "specialist failed but Simon claims success" failure mode:
            // a delegate_to_* tool call returned an error (e.g. "Specialist charlie
            // timed out after 180s"), and Simon then told the director "Done —
            // Charlie's working on it" without acknowledging the failure. Without
            // this guard the director thinks a draft is on its way and waits
            // indefinitely. Mastra surfaces tool-execution errors via toolResults
            // entries with isError=true (or, for older shapes, by stringifying the
            // thrown error into result), so we check both.
            const toolResults = result.toolResults ?? [];
            const failedDelegate = toolResults.find((r) => {
              if (!r.toolName?.startsWith('delegate_to_')) return false;
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
              /\b(done|drafted|created|wrote|posted|sent|completed|all set|here'?s|here you go|ready (?:shortly|soon|now|in a moment)|will (?:be|have it) ready|working on (?:it|that|a|the))\b/i.test(
                result.text,
              );
            const silentFailure =
              !!failedDelegate && !acknowledgesFailure && claimsSuccessOrInProgress;

            let replyText = result.text;
            if (claimsDelegation && !delegated) {
              replyText = `${result.text}\n\n[system: I named a specialist but didn't actually invoke one — please retry, or rephrase the directive.]`;
              console.warn(
                '[web-directives] Simon claimed delegation but made no delegate_* tool call:',
                result.text.slice(0, 200),
              );
            } else if (silentFailure) {
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
              replyText = `${result.text}\n\n[system: ${failedDelegate.toolName} actually returned an error: ${errStr}. Please resend the directive — a shorter prompt sometimes helps.]`;
              console.warn(
                '[web-directives] Simon claimed success but delegate tool errored:',
                { toolName: failedDelegate.toolName, error: errStr, replyPrefix: result.text.slice(0, 200) },
              );
            } else if (emptyRetryPromise) {
              replyText = `${result.text}\n\n[system: Simon promised a retry but didn't actually run one. Please resend the directive — a shorter prompt sometimes helps.]`;
              console.warn(
                '[web-directives] Simon promised a retry but made no follow-up delegate_* tool call:',
                result.text.slice(0, 200),
              );
            }

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
    )
    .subscribe((status, err) => {
      // Ignore callbacks from stale channels
      if (channel !== currentChannel) return;

      console.log('[web-directives] Subscription status:', status);
      if (err) console.error('[web-directives] Subscription error:', err);
      if (status === 'SUBSCRIBED') {
        hasEverSubscribed = true;
        reconnectAttempt = 0;
        console.log('[web-directives] Listening for web directives via Supabase Realtime');
      } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
        scheduleReconnect(err ? String(err) : status);
      } else if (status === 'CLOSED') {
        scheduleReconnect('CLOSED');
      }
    });

  currentChannel = channel;
}
