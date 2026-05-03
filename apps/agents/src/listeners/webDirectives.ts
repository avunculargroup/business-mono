import { createRealtimeClient } from '@platform/db';

const supabase = createRealtimeClient();
import { simon } from '../agents/simon/index.js';
import type { ConvMessage, ConvRow } from './types.js';

// Module-level state so reconnect logic is properly deduped across calls
let currentChannel: ReturnType<typeof supabase.channel> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let hasEverSubscribed = false;

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

          try {
            // Generate Simon's response via Mastra Memory
            const result = await simon.generate(lastMessage.content, {
              memory: {
                resource: 'web-director',
                thread: conv.id,
              },
            });

            // Guard against the "Simon claimed delegation but didn't actually invoke a
            // specialist" failure mode. Make it loud rather than silent so directors
            // see something is wrong instead of waiting on a draft that will never come.
            const toolCalls = (result as { toolCalls?: Array<{ toolName?: string }> }).toolCalls ?? [];
            const delegated = toolCalls.some((c) => c.toolName?.startsWith('delegate_to_'));
            const claimsDelegation =
              /\bdelegat|hand(ed|ing) (this )?(off|over) to|asked? \w+ to (draft|research|check|find|look)/i.test(
                result.text,
              );
            const replyText =
              claimsDelegation && !delegated
                ? `${result.text}\n\n[system: I named a specialist but didn't actually invoke one — please retry, or rephrase the directive.]`
                : result.text;
            if (claimsDelegation && !delegated) {
              console.warn(
                '[web-directives] Simon claimed delegation but made no delegate_* tool call:',
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
            const errorMessage: ConvMessage = {
              role: 'assistant',
              content: 'Something went wrong processing your request. Please try again.',
              timestamp: new Date().toISOString(),
              source: 'simon',
            };
            await supabase
              .from('agent_conversations')
              .update({ messages: [...messages, errorMessage], is_processing: false } as never)
              .eq('id', conv.id);
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
