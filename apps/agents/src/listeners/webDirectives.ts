import { supabase } from '@platform/db';
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
  messages: unknown;
};

/**
 * Subscribes to agent_conversations via Supabase Realtime.
 * When a new user message arrives on the web thread, Simon processes it
 * and writes the response back — no HTTP call between services needed.
 */
export function startWebDirectivesListener(): void {
  supabase
    .channel('web-directives')
    .on(
      'postgres_changes' as never,
      { event: '*', schema: 'public', table: 'agent_conversations' },
      async (payload: { eventType: string; new: ConvRow }) => {
        if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return;

        const conv = payload.new;
        if (conv.signal_chat_id !== 'web') return;

        const messages: ConvMessage[] = Array.isArray(conv.messages) ? conv.messages : [];
        const lastMessage = messages[messages.length - 1];

        // Only process when the latest message is from the director (user)
        if (!lastMessage || lastMessage.role !== 'user') return;

        try {
          const messagesForSimon = messages.map((m) => ({
            role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
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
            .update({
              messages: [...messages, simonMessage],
              last_message_at: new Date().toISOString(),
            })
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
    .subscribe();

  console.log('Listening for web directives via Supabase Realtime');
}
