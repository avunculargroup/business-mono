import { supabase } from '@platform/db';
import type { CoreMessage } from 'ai';
import { simon } from '../agents/simon/index.js';

type ConvMessage = {
  role: string;
  content: string;
  timestamp?: string;
  source?: string;
};

type ConvRow = {
  id: string;
  signal_chat_id: string;
  thread_type: string;
  messages: unknown;
};

// Module-level state so reconnect logic is properly deduped across calls
let currentChannel: ReturnType<typeof supabase.channel> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleReconnect(): void {
  // Guard: only one reconnect timer at a time
  if (reconnectTimer !== null) return;
  console.log('[web-directives] Reconnecting in 5s...');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startWebDirectivesListener();
  }, 5000);
}

/**
 * Subscribes to agent_conversations via Supabase Realtime.
 * When a new user message arrives on the web thread, Simon processes it
 * and writes the response back — no HTTP call between services needed.
 */
export function startWebDirectivesListener(): void {
  // Cancel any pending reconnect
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // Clean up existing channel before creating a new one
  if (currentChannel !== null) {
    void supabase.removeChannel(currentChannel);
    currentChannel = null;
  }

  currentChannel = supabase
    .channel('web-directives')
    .on(
      'postgres_changes' as never,
      { event: '*', schema: 'public', table: 'agent_conversations' },
      async (payload: { eventType: string; new: ConvRow }) => {
        console.log('[web-directives] Received event:', payload.eventType);
        if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return;

        const conv = payload.new;
        if (conv.signal_chat_id !== 'web') return;
        console.log('[web-directives] Processing web conversation:', conv.id);

        const messages: ConvMessage[] = Array.isArray(conv.messages) ? conv.messages : [];
        const lastMessage = messages[messages.length - 1];

        // Only process when the latest message is from the director (user)
        if (!lastMessage || lastMessage.role !== 'user') return;

        try {
          const messagesForSimon: CoreMessage[] = messages.map((m) => ({
            role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
            content: m.content,
          }));

          const result = await simon.generate(messagesForSimon);

          const simonMessage: ConvMessage = {
            role: 'assistant',
            content: result.text,
            timestamp: new Date().toISOString(),
            source: 'simon',
          };

          await supabase
            .from('agent_conversations')
            .update({ messages: [...messages, simonMessage] })
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
        }
      }
    )
    .subscribe((status, err) => {
      console.log('[web-directives] Subscription status:', status);
      if (err) console.error('[web-directives] Subscription error:', err);
      if (status === 'SUBSCRIBED') {
        console.log('Listening for web directives via Supabase Realtime');
      } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
        scheduleReconnect();
      } else if (status === 'CLOSED') {
        // CLOSED fires after TIMED_OUT tears down the channel — scheduleReconnect
        // is a no-op if a timer is already pending, preventing duplicate reconnects.
        scheduleReconnect();
      }
    });
}
