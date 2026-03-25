import { SignalClient } from '@platform/signal';
import { supabase } from '@platform/db';
import { simon } from '../agents/simon/index.js';

const client = new SignalClient();
const POLL_INTERVAL_MS = 10_000;

type ConvMessage = {
  role: string;
  content: string;
  timestamp?: string;
  source?: string;
};

let polling = false;

async function poll(): Promise<void> {
  if (polling) return;
  polling = true;

  try {
    const incoming = await client.receiveMessages();

    for (const envelope of incoming) {
      const dm = envelope.envelope.dataMessage;
      if (!dm?.message) continue; // skip receipts, typing indicators, etc.

      const senderNumber = envelope.envelope.sourceNumber || envelope.envelope.source;
      if (!senderNumber) continue;

      const userMessage = dm.message.trim();
      if (!userMessage) continue;

      console.log(`[signal-listener] Message from ${senderNumber}: ${userMessage.slice(0, 80)}`);

      // Get or create conversation thread keyed by sender's phone number
      let { data: conv } = await supabase
        .from('agent_conversations')
        .select('id, messages')
        .eq('signal_chat_id', senderNumber)
        .single();

      if (!conv) {
        const { data: created, error } = await supabase
          .from('agent_conversations')
          .insert({
            signal_chat_id: senderNumber,
            thread_type: 'direct',
            messages: [],
          })
          .select('id, messages')
          .single();

        if (error || !created) {
          console.error('[signal-listener] Failed to create conversation:', error);
          continue;
        }
        conv = created;
      }

      const messages: ConvMessage[] = Array.isArray(conv.messages) ? conv.messages : [];

      const newUserMessage: ConvMessage = {
        role: 'user',
        content: userMessage,
        timestamp: new Date(dm.timestamp).toISOString(),
        source: senderNumber,
      };

      const updatedMessages = [...messages, newUserMessage];

      // Generate Simon's response
      let responseText: string;
      try {
        const messagesForSimon = updatedMessages.map((m) => ({
          role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.content,
        }));

        const result = await simon.generate(messagesForSimon);
        responseText = result.text;
      } catch (err) {
        console.error('[signal-listener] Simon error:', err);
        continue;
      }

      // Send reply via Signal
      try {
        await client.sendMessage({ recipients: [senderNumber], message: responseText });
      } catch (err) {
        console.error('[signal-listener] Send error:', err);
      }

      const simonMessage: ConvMessage = {
        role: 'assistant',
        content: responseText,
        timestamp: new Date().toISOString(),
        source: 'simon',
      };

      // Persist conversation
      await supabase
        .from('agent_conversations')
        .update({
          messages: [...updatedMessages, simonMessage],
          last_message_at: new Date().toISOString(),
        })
        .eq('id', conv.id);

      // Audit log
      await supabase.from('agent_activity').insert({
        agent_name: 'simon',
        action: `Signal message from ${senderNumber}: ${userMessage.slice(0, 120)}`,
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
    }
  } catch (err) {
    console.error('[signal-listener] Poll error:', err);
  } finally {
    polling = false;
  }
}

export function startSignalListener(): void {
  console.log(`[signal-listener] Polling for Signal messages every ${POLL_INTERVAL_MS / 1000}s`);
  poll(); // immediate first poll
  setInterval(poll, POLL_INTERVAL_MS);
}
